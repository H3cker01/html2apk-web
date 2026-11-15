import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import { hash, hashPassword, makeSessionToken, SESSION_COOKIE, COOKIE_OPTS } from "@/lib/auth";

export async function POST(req) {
  const { email, code, password } = await req.json();
  if (!email || !code || !password || password.length < 8) {
    return Response.json({ error: "Email, code and 8+ character password required" }, { status: 400 });
  }

  const rows = await sql`SELECT code_hash, expires_at FROM email_codes WHERE email = ${email}`;
  if (!rows[0]) return Response.json({ error: "No reset code found" }, { status: 400 });
  if (new Date(rows[0].expires_at) < new Date()) return Response.json({ error: "Code expired" }, { status: 400 });
  if (rows[0].code_hash !== hash(String(code).trim())) return Response.json({ error: "Wrong code" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const users = await sql`
    UPDATE users SET password_hash = ${passwordHash} WHERE email = ${email} RETURNING id`;
  await sql`DELETE FROM email_codes WHERE email = ${email}`;

  const token = await makeSessionToken(users[0].id);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${SESSION_COOKIE}=${token}; ${COOKIE_OPTS}`,
    },
  });
}
