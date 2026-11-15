import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import nodemailer from "nodemailer";
import { hash, hashPassword, newCode } from "@/lib/auth";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
});

export async function POST(req) {
  const { email, password } = await req.json();
  if (!email || !password || password.length < 8) {
    return Response.json({ error: "Email and 8+ character password required" }, { status: 400 });
  }

  const rows = await sql`SELECT email_verified FROM users WHERE email = ${email}`;
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

  await transporter.sendMail({
    from: `html2apk <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Your html2apk verification code",
    text: `Your verification code is: ${code}\n\nExpires in 10 minutes.`,
  });

  return Response.json({ ok: true });
}
