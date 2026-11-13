import { sql } from "@vercel/postgres";
import { userFromApiKey } from "@/lib/auth";

const REPO = "H3cker01/html2apk-web";
const gh = {
  Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "html2apk",
};

export async function GET(req, { params }) {
  const user = await userFromApiKey(req.headers.get("authorization"));
  if (!user) return Response.json({ error: "Invalid API key" }, { status: 401 });

  const { rows } = await sql`SELECT status FROM builds WHERE id = ${params.id} AND user_id = ${user.id}`;
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  const list = await fetch(
    `https://api.github.com/repos/${REPO}/actions/artifacts?name=${params.id}`,
    { headers: gh }
  ).then((r) => r.json());

  const artifact = list.artifacts?.[0];
  if (!artifact) {
    return Response.json({ status: "building" }, { status: 202 });
  }

  await sql`UPDATE builds SET status = 'done' WHERE id = ${params.id}`;

  const zip = await fetch(artifact.archive_download_url, { headers: gh, redirect: "follow" });
  return new Response(zip.body, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="${params.id}.apk"`,
    },
  });
}
