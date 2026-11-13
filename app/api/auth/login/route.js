import { sql } from "@vercel/postgres";
import { checkPassword, createSession } from "@/lib/auth";

export async function POST(req) {
  const { email, password } = await req.json();
  const { rows } = await sql`
    SELECT id, password_hash, email_verified FROM users WHERE email = ${email}`;
  const user = rows[0];

  if (!user?.password_hash || !(await checkPassword(password, user.password_hash))) {
    return Response.json({ error: "Wrong email or password" }, { status: 401 });
  }
  if (!user.email_verified) {
    return Response.json({ error: "Verify your email first" }, { status: 403 });
  }

  await createSession(user.id);
  return Response.json({ ok: true });
}
