// GET /api/status?runId=xxx&token=yyy
// Returns { status: 'queued'|'in_progress'|'completed'|'failed', downloadUrl? }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { runId, token } = req.query;
  if (!runId || !token) return res.status(400).json({ error: 'runId and token required' });

  const GH_TOKEN   = process.env.GH_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME  = process.env.REPO_NAME;

  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Get run status
  const runRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}`,
    { headers }
  );
  const run = await runRes.json();

  if (run.status !== 'completed') {
    return res.status(200).json({ status: run.status }); // queued | in_progress
  }

  if (run.conclusion !== 'success') {
    return res.status(200).json({ status: 'failed', conclusion: run.conclusion });
  }

  // Get artifacts
  const artRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}/artifacts`,
    { headers }
  );
  const artData = await artRes.json();

  const artifact = artData.artifacts?.find(a => a.name.includes(token));
  if (!artifact) return res.status(200).json({ status: 'failed', error: 'Artifact not found' });

  // Return artifact id — frontend will call /api/download to proxy it
  return res.status(200).json({
    status: 'completed',
    artifactId: artifact.id,
    artifactName: artifact.name,
  });
}
