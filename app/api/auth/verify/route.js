import { sql } from "@vercel/postgres";
import { createSession, hash } from "@/lib/auth";

export async function POST(req) {
  const { email, code } = await req.json();
  const { rows } = await sql`
    SELECT code_hash FROM email_codes WHERE email = ${email} AND expires_at > NOW()`;

  if (!rows[0] || rows[0].code_hash !== hash(String(code))) {
    return Response.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  const { rows: users } = await sql`
    UPDATE users SET email_verified = TRUE WHERE email = ${email} RETURNING id`;
  await sql`DELETE FROM email_codes WHERE email = ${email}`;
  await createSession(users[0].id);

  return Response.json({ ok: true });
}
