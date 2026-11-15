import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import { getUserFromToken, newApiKey, SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req) {
  const token = req.cookies?.get?.(SESSION_COOKIE)?.value
    ?? req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  const user = await getUserFromToken(token);
  if (!user) return Response.json({ error: "Login required" }, { status: 401 });

  const { key, keyHash, prefix } = newApiKey();
  await sql`INSERT INTO api_keys (user_id, key_hash, key_prefix) VALUES (${user.id}, ${keyHash}, ${prefix})`;

  return Response.json({ key, note: "Save this key now. It will not be shown again." });
}
