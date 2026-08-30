export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// ── In-memory rate limiter (per Vercel serverless instance) ──────────────────
const rateLimitMap = new Map(); // ip -> { count, windowStart, building }

function checkRateLimit(ip) {
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000;
  const MAX    = 3;

  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > WINDOW) {
    entry = { count: 0, windowStart: now, building: false };
  }

  if (entry.building) {
    return { allowed: false, reason: 'You already have a build in progress. Please wait for it to finish.' };
  }
  if (entry.count >= MAX) {
    const resetIn = Math.ceil((WINDOW - (now - entry.windowStart)) / 60000);
    return { allowed: false, reason: `Rate limit reached (${MAX} builds/hour). Resets in ~${resetIn} min.` };
  }

  entry.count++;
  entry.building = true;
  rateLimitMap.set(ip, entry);
  return { allowed: true };
}

function releaseBuild(ip) {
  const entry = rateLimitMap.get(ip);
  if (entry) { entry.building = false; rateLimitMap.set(ip, entry); }
}

// ── Malicious code block map (mirrors scan.js state via internal fetch) ───────
// We call /api/scan internally before proceeding

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();

  const {
    html, appName = 'MyApp', packageName = 'com.example.myapp',
    iconBase64,
    buildType = 'apk',
    permissions = [],
    signing = 'debug',
    ksAlias, ksPass, ksKeyPass,
    ksBase64, ksFilePass, ksFileAlias, ksFileKeyPass,
  } = req.body;

  if (!html) return res.status(400).json({ error: 'html is required' });
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)) {
    return res.status(400).json({ error: 'Invalid package name' });
  }

  // ── Scan HTML for malicious code BEFORE rate limit / build ──────────────────
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const scanRes = await fetch(`${baseUrl}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ html }),
  });
  const scanData = await scanRes.json();

  if (scanData.blocked || scanData.malicious) {
    return res.status(403).json({
      malicious: true,
      error: scanData.error,
      findings: scanData.findings || [],
      hours: scanData.hours,
      offenses: scanData.offenses,
      blockedUntil: scanData.blockedUntil,
      remaining: scanData.remaining,
    });
  }
  // ── End scan ─────────────────────────────────────────────────────────────────

  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return res.status(429).json({ error: limit.reason });
  }

  const token      = crypto.randomUUID();
  const GH_TOKEN   = process.env.GH_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME  = process.env.REPO_NAME;

  if (!GH_TOKEN || !REPO_OWNER || !REPO_NAME) {
    releaseBuild(ip); return res.status(500).json({ error: 'Server misconfigured' });
  }

  const ghHeaders = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  try {
    const gistFiles = { 'index.html': { content: html } };
    if (iconBase64) gistFiles['icon.png.b64'] = { content: iconBase64 };

    const gistRes = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ description: `html2apk-${token}`, public: false, files: gistFiles }),
    });

    if (!gistRes.ok) {
      const err = await gistRes.text();
      releaseBuild(ip);
      return res.status(500).json({ error: 'Failed to upload HTML', detail: err });
    }

    const gistData = await gistRes.json();
    const htmlUrl  = gistData.files['index.html'].raw_url;
    const iconUrl  = iconBase64 ? gistData.files['icon.png.b64'].raw_url : '';

    const inputs = {
      html_url:     htmlUrl,
      icon_url:     iconUrl,
      app_name:     appName,
      package_name: packageName,
      run_id_token: token,
      build_type:   buildType,
      permissions:  Array.isArray(permissions) ? permissions.join(',') : '',
      signing,
      ks_alias:    signing === 'generate' ? (ksAlias || 'mykey') : (signing === 'upload' ? ksFileAlias : ''),
      ks_pass:     signing === 'generate' ? ksPass    : (signing === 'upload' ? ksFilePass    : ''),
      ks_key_pass: signing === 'generate' ? ksKeyPass : (signing === 'upload' ? ksFileKeyPass : ''),
      ks_base64:   signing === 'upload'   ? ksBase64  : '',
    };

    const triggerRes = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/build-apk.yml/dispatches`,
      { method: 'POST', headers: ghHeaders, body: JSON.stringify({ ref: 'main', inputs }) }
    );

    if (!triggerRes.ok) {
      const err = await triggerRes.text();
      releaseBuild(ip);
      return res.status(500).json({ error: 'Failed to trigger build', detail: err });
    }

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

    if (!run) {
      releaseBuild(ip);
      return res.status(500).json({ error: 'Could not find workflow run — try again' });
    }

    releaseBuild(ip);
    return res.status(200).json({ runId: run.id, token });

  } catch (e) {
    releaseBuild(ip);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
