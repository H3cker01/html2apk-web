import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import { userFromApiKey } from "@/lib/auth";

const REPO = "H3cker01/html2apk-web";
const gh = {
  Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "html2apk",
};

export async function GET(req, context) {
  const { id } = await context.params;
  const user = await userFromApiKey(req.headers.get("authorization"));
  if (!user) return Response.json({ error: "Invalid API key" }, { status: 401 });

  const rows = await sql`
    SELECT id, status, app_name, package_id, created_at FROM builds
    WHERE id = ${id} AND user_id = ${user.id}`;
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  let status = rows[0].status;

  // If not done/failed, check GitHub for real status
  if (status !== "done" && status !== "failed") {
    const artifact = await fetch(
      `https://api.github.com/repos/${REPO}/actions/artifacts?name=${id}`,
      { headers: gh }
    ).then(r => r.json());

    if (artifact.artifacts?.[0]) {
      status = "done";
      await sql`UPDATE builds SET status = 'done' WHERE id = ${id}`;
    } else {
      // Check workflow runs and match by build_id input
      const runs = await fetch(
        `https://api.github.com/repos/${REPO}/actions/runs?event=workflow_dispatch&per_page=20`,
        { headers: gh }
      ).then(r => r.json());

      const matched = runs.workflow_runs?.find(r => r.name === `build-${id}`);

      if (matched?.conclusion === "failure") {
        status = "failed";
        await sql`UPDATE builds SET status = 'failed' WHERE id = ${id}`;
      } else {
        status = "building";
        await sql`UPDATE builds SET status = 'building' WHERE id = ${id}`;
      }
    }
  }

  return Response.json({ ...rows[0], status });
}
