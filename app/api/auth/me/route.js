import { getUserFromToken } from "@/lib/auth";

export async function GET(req) {
  const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
  const user = await getUserFromToken(token);
  if (!user) return Response.json({ user: null });
  return Response.json({ user: { email: user.email } });
}
