import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import { getUserFromToken, newApiKey, encryptKey, decryptKey, SESSION_COOKIE } from "@/lib/auth";

export async function GET(req) {
  const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  const user = await getUserFromToken(token);
  if (!user) return Response.json({ error: "Login required" }, { status: 401 });

  const rows = await sql`
    SELECT id, key_prefix, key_encrypted, created_at FROM api_keys
    WHERE user_id = ${user.id} ORDER BY created_at DESC`;

  const keys = rows.map(r => ({
    id: r.id,
    key: r.key_encrypted ? decryptKey(r.key_encrypted) : null,
    prefix: r.key_prefix,
    created_at: r.created_at,
  }));

  return Response.json({ keys });
}

export async function POST(req) {
  const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  const user = await getUserFromToken(token);
  if (!user) return Response.json({ error: "Login required" }, { status: 401 });

  const count = await sql`SELECT COUNT(*)::int AS n FROM api_keys WHERE user_id = ${user.id}`;
  if (count[0].n >= 3) {
    return Response.json({ error: "Max 3 API keys per account. Delete one first." }, { status: 400 });
  }

  const { key, keyHash, prefix } = newApiKey();
  const keyEncrypted = encryptKey(key);
  await sql`INSERT INTO api_keys (user_id, key_hash, key_prefix, key_encrypted) VALUES (${user.id}, ${keyHash}, ${prefix}, ${keyEncrypted})`;

  return Response.json({ key });
}

export async function DELETE(req) {
  const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  const user = await getUserFromToken(token);
  if (!user) return Response.json({ error: "Login required" }, { status: 401 });

  const { id } = await req.json();
  await sql`DELETE FROM api_keys WHERE id = ${id} AND user_id = ${user.id}`;
  return Response.json({ ok: true });
}
