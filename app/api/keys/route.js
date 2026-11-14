import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import { getSessionUser, newApiKey } from "@/lib/auth";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Login required" }, { status: 401 });

  const { key, keyHash, prefix } = newApiKey();
  await sql`INSERT INTO api_keys (user_id, key_hash, key_prefix) VALUES (${user.id}, ${keyHash}, ${prefix})`;

  return Response.json({ key, note: "Save this key now. It will not be shown again." });
}
