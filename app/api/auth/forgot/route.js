import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import nodemailer from "nodemailer";
import { hash, newCode } from "@/lib/auth";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
  connectionTimeout: 5000,
  socketTimeout: 5000,
});

export async function POST(req) {
  const { email } = await req.json();
  if (!email) return Response.json({ error: "Email required" }, { status: 400 });

  const rows = await sql`SELECT id FROM users WHERE email = ${email} AND email_verified = TRUE`;
  // Always return ok to avoid leaking whether email exists
  if (!rows[0]) return Response.json({ ok: true });

  // Rate limit: one reset per 60s
  const existing = await sql`SELECT expires_at FROM email_codes WHERE email = ${email}`;
  if (existing[0]) {
    const sentAt = new Date(new Date(existing[0].expires_at).getTime() - 10 * 60 * 1000);
    if ((Date.now() - sentAt.getTime()) / 1000 < 60) {
      return Response.json({ ok: true }); // silent rate limit
    }
  }

  const code = newCode();
  await sql`
    INSERT INTO email_codes (email, code_hash, expires_at)
    VALUES (${email}, ${hash(code)}, NOW() + INTERVAL '10 minutes')
    ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at`;

  await transporter.sendMail({
    from: `html2apk <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Reset your html2apk password",
    text: `Your password reset code is: ${code}\n\nExpires in 10 minutes.`,
  });

  return Response.json({ ok: true });
}
