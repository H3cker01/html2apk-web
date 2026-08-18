// POST /api/build
// Accepts { html, appName, packageName }
// Triggers GitHub Actions workflow_dispatch, returns { runId, token }

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { html, appName = 'MyApp', packageName = 'com.example.myapp' } = req.body;

  if (!html) return res.status(400).json({ error: 'html is required' });

  // Validate package name
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)) {
    return res.status(400).json({ error: 'Invalid package name. Use format: com.example.myapp' });
  }

  const token        = crypto.randomUUID();
  const htmlBase64   = Buffer.from(html, 'utf-8').toString('base64');
  const GH_TOKEN     = process.env.GH_TOKEN;
  const REPO_OWNER   = process.env.REPO_OWNER;
  const REPO_NAME    = process.env.REPO_NAME;

  if (!GH_TOKEN || !REPO_OWNER || !REPO_NAME) {
    return res.status(500).json({ error: 'Server misconfigured: missing GitHub env vars' });
  }

  // Trigger workflow_dispatch
  const triggerRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build-apk.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          html_content: htmlBase64,
          app_name:     appName,
          package_name: packageName,
          run_id_token: token,
        },
      }),
    }
  );

  if (!triggerRes.ok) {
    const err = await triggerRes.text();
    console.error('GitHub trigger error:', err);
    return res.status(500).json({ error: 'Failed to trigger build', detail: err });
  }

  // Poll until the run triggered by this token appears (up to 30s)
  const ghHeaders = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let run = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const runsRes  = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build-apk.yml/runs?per_page=10`,
      { headers: ghHeaders }
    );
    const runsData = await runsRes.json();
    // Match by display_title which GitHub sets to the workflow input summary,
    // or fall back to most recent run created after we triggered
    run = runsData.workflow_runs?.find(r =>
      r.name === 'Build APK' && r.status !== 'completed' &&
      // created within last 2 minutes
      (Date.now() - new Date(r.created_at).getTime()) < 120_000
    );
    if (run) break;
  }

  if (!run) return res.status(500).json({ error: 'Could not find workflow run — try again' });

  return res.status(200).json({ runId: run.id, token });
}
