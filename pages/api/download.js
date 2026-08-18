// GET /api/download?artifactId=xxx&name=yyy
// Proxies the APK zip from GitHub to the user

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { artifactId, name } = req.query;
  if (!artifactId) return res.status(400).json({ error: 'artifactId required' });

  const GH_TOKEN   = process.env.GH_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME  = process.env.REPO_NAME;

  const ghRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/artifacts/${artifactId}/zip`,
    {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'follow',
    }
  );

  if (!ghRes.ok) {
    return res.status(500).json({ error: 'Failed to fetch artifact from GitHub' });
  }

  const buffer = await ghRes.arrayBuffer();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name || 'app'}.zip"`);
  res.status(200).send(Buffer.from(buffer));
}
