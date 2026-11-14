import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import crypto from "crypto";
import { userFromApiKey } from "@/lib/auth";

const DAILY_LIMIT = 50;
const REPO = "H3cker01/html2apk-web";

export async function POST(req) {
  const user = await userFromApiKey(req.headers.get("authorization"));
  if (!user) return Response.json({ error: "Invalid API key" }, { status: 401 });

  const count = await sql`
    SELECT COUNT(*)::int AS n FROM builds
    WHERE user_id = ${user.id} AND created_at > NOW() - INTERVAL '24 hours'`;
  if (count[0].n >= DAILY_LIMIT) {
    return Response.json({ error: "Daily build limit reached" }, { status: 429 });
  }

  const { appName, packageId, html, url } = await req.json();
  if (!appName || !packageId || (!html && !url)) {
    return Response.json({ error: "appName, packageId, and html or url required" }, { status: 400 });
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(packageId)) {
    return Response.json({ error: "Invalid packageId" }, { status: 400 });
  }

  const buildId = crypto.randomUUID();
  await sql`
    INSERT INTO builds (id, user_id, status, app_name, package_id)
    VALUES (${buildId}, ${user.id}, 'queued', ${appName}, ${packageId})`;

  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/build-apk.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: { build_id: buildId, app_name: appName, package_id: packageId, source_url: url ?? "", source_html: html ?? "" },
    }),
  });

  if (!res.ok) {
    await sql`UPDATE builds SET status = 'failed' WHERE id = ${buildId}`;
    return Response.json({ error: "Could not start build" }, { status: 502 });
  }

  return Response.json({ id: buildId, status: "queued" }, { status: 202 });
}
