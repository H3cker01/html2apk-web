import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import { makeSessionToken, SESSION_COOKIE, COOKIE_OPTS, hash } from "@/lib/auth";

export async function POST(req) {
  const { email, code } = await req.json();
  if (!email || !code) {
    return Response.json({ error: "Email and code required" }, { status: 400 });
  }

  const trimmedCode = String(code).trim();
  const rows = await sql`SELECT code_hash, expires_at FROM email_codes WHERE email = ${email}`;

  if (!rows[0]) return Response.json({ error: "No code found for this email" }, { status: 400 });
  if (new Date(rows[0].expires_at) < new Date()) return Response.json({ error: "Code expired, request a new one" }, { status: 400 });
  if (rows[0].code_hash !== hash(trimmedCode)) return Response.json({ error: "Wrong code" }, { status: 400 });

  const users = await sql`UPDATE users SET email_verified = TRUE WHERE email = ${email} RETURNING id`;
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
