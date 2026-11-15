import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.SESSION_SECRET);

export const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");

export async function makeSessionToken(userId) {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret);
}

export const SESSION_COOKIE = "session";
export const COOKIE_OPTS = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;

export async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const rows = await sql`SELECT id, email FROM users WHERE id = ${payload.uid}`;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function newApiKey() {
  const key = "h2a_" + crypto.randomBytes(24).toString("hex");
  return { key, keyHash: hash(key), prefix: key.slice(0, 9) };
}

export async function userFromApiKey(authHeader) {
  const key = authHeader?.replace(/^Bearer\s+/i, "");
  if (!key) return null;
  const rows = await sql`
    SELECT u.id, u.email FROM api_keys k JOIN users u ON u.id = k.user_id
    WHERE k.key_hash = ${hash(key)}`;
  return rows[0] ?? null;
}

export const hashPassword = (p) => bcrypt.hash(p, 10);
export const checkPassword = (p, h) => bcrypt.compare(p, h);

export function newCode() {
  return String(crypto.randomInt(100000, 1000000));
}
