import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "cert_session";
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Cookie options: httpOnly so client JS can never read the JWT. */
export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** The raw JWT from the session cookie, or null. */
export async function getToken() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value || null;
}

/**
 * Resolves the logged-in organization by asking the API who the token belongs
 * to. Returns null for a missing, expired, or otherwise rejected token.
 */
export async function getOrganization() {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.organization || null;
  } catch {
    return null;
  }
}

/** Same as getOrganization, but sends anonymous visitors to /login. */
export async function requireOrganization() {
  const organization = await getOrganization();
  if (!organization) redirect("/login");
  return organization;
}
