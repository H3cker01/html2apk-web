export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    html, appName = 'MyApp', packageName = 'com.example.myapp',
    iconBase64,
    signing = 'debug',
    ksAlias, ksPass, ksKeyPass,
    ksBase64, ksFilePass, ksFileAlias, ksFileKeyPass,
  } = req.body;

  if (!html) return res.status(400).json({ error: 'html is required' });
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName))
    return res.status(400).json({ error: 'Invalid package name' });

  const token    = crypto.randomUUID();
  const GH_TOKEN = process.env.GH_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME  = process.env.REPO_NAME;

  if (!GH_TOKEN || !REPO_OWNER || !REPO_NAME)
    return res.status(500).json({ error: 'Server misconfigured' });

  const ghHeaders = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  // Upload HTML to Gist
  const gistFiles = { 'index.html': { content: html } };
  if (iconBase64) gistFiles['icon.png.b64'] = { content: iconBase64 };

  const gistRes = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: ghHeaders,
    body: JSON.stringify({ description: `html2apk-${token}`, public: false, files: gistFiles }),
  });

  if (!gistRes.ok) {
    const err = await gistRes.text();
    console.error('Gist upload error:', err);
    return res.status(500).json({ error: 'Failed to upload HTML', detail: err });
  }

  const gistData = await gistRes.json();
  const htmlUrl  = gistData.files['index.html'].raw_url;
  const iconUrl  = iconBase64 ? gistData.files['icon.png.b64'].raw_url : '';

  // Build workflow inputs
  const inputs = {
    html_url:     htmlUrl,
    icon_url:     iconUrl,
    app_name:     appName,
    package_name: packageName,
    run_id_token: token,
    signing,
    ks_alias:     signing === 'generate' ? (ksAlias || 'mykey') : (signing === 'upload' ? ksFileAlias : ''),
    ks_pass:      signing === 'generate' ? ksPass    : (signing === 'upload' ? ksFilePass    : ''),
    ks_key_pass:  signing === 'generate' ? ksKeyPass : (signing === 'upload' ? ksFileKeyPass : ''),
    ks_base64:    signing === 'upload'   ? ksBase64  : '',
  };

  const triggerRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build-apk.yml/dispatches`,
    { method: 'POST', headers: ghHeaders, body: JSON.stringify({ ref: 'main', inputs }) }
  );

  if (!triggerRes.ok) {
    const err = await triggerRes.text();
    console.error('GitHub trigger error:', err);
    return res.status(500).json({ error: 'Failed to trigger build', detail: err });
  }

  // Find run
  let run = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const runsRes  = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build-apk.yml/runs?per_page=10`,
      { headers: ghHeaders }
    );
    const runsData = await runsRes.json();
    run = runsData.workflow_runs?.find(r =>
      r.status !== 'completed' && (Date.now() - new Date(r.created_at).getTime()) < 120_000
    );
    if (run) break;
  }

  if (!run) return res.status(500).json({ error: 'Could not find workflow run — try again' });
  return res.status(200).json({ runId: run.id, token });
}
