import { sql } from "@vercel/postgres";
import { Resend } from "resend";
import { hash, hashPassword, newCode } from "@/lib/auth";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req) {
  const { email, password } = await req.json();
  if (!email || !password || password.length < 8) {
    return Response.json({ error: "Email and 8+ character password required" }, { status: 400 });
  }

  const { rows } = await sql`SELECT email_verified FROM users WHERE email = ${email}`;
  if (rows[0]?.email_verified) {
    return Response.json({ error: "Account already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  await sql`
    INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`;

  const code = newCode();
  await sql`
    INSERT INTO email_codes (email, code_hash, expires_at)
    VALUES (${email}, ${hash(code)}, NOW() + INTERVAL '10 minutes')
    ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at`;

  await resend.emails.send({
    from: process.env.MAIL_FROM,
    to: email,
    subject: "Your html2apk verification code",
    text: `Your code is ${code}. It expires in 10 minutes.`,
  });

  return Response.json({ ok: true });
}
