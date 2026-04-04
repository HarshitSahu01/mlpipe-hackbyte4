// src/lib/auth.js
// JWT-based auth helpers (no Auth.js/NextAuth — project uses custom JWT cookies)
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Missing environment variable: "JWT_SECRET"');
}

/**
 * Verifies the JWT from the httpOnly cookie and returns the decoded payload.
 * Returns null if the token is absent or invalid.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload; // { userId, email, role, iat, exp }
  } catch {
    return null;
  }
}

/**
 * Throws a 401 JSON response if not authenticated.
 * Use at the top of protected route handlers.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    const { NextResponse } = await import("next/server");
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: null };
}
