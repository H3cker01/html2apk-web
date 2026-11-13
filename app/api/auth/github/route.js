import { sql } from "@vercel/postgres";
import { createSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", `${process.env.APP_URL}/api/auth/github`);
    authUrl.searchParams.set("scope", "read:user user:email");
    redirect(authUrl.toString());
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token } = await tokenRes.json();

  const headers = { Authorization: `Bearer ${access_token}`, "User-Agent": "html2apk" };
  const ghUser = await (await fetch("https://api.github.com/user", { headers })).json();
  const emails = await (await fetch("https://api.github.com/user/emails", { headers })).json();
  const email = emails.find((e) => e.primary && e.verified)?.email ?? ghUser.email;

  const { rows } = await sql`
    INSERT INTO users (email, github_id, email_verified)
    VALUES (${email ?? `gh-${ghUser.id}@noemail.local`}, ${String(ghUser.id)}, TRUE)
    ON CONFLICT (github_id) DO UPDATE SET email_verified = TRUE
    RETURNING id`;

  await createSession(rows[0].id);
  redirect("/dashboard");
}
