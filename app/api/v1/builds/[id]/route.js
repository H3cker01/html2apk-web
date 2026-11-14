import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import { userFromApiKey } from "@/lib/auth";

export async function GET(req, { params }) {
  const user = await userFromApiKey(req.headers.get("authorization"));
  if (!user) return Response.json({ error: "Invalid API key" }, { status: 401 });

  const rows = await sql`
    SELECT id, status, app_name, package_id, created_at FROM builds
    WHERE id = ${params.id} AND user_id = ${user.id}`;
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(rows[0]);
}
