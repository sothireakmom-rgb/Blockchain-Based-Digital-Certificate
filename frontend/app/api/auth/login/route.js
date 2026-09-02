import { NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/** Proxies login to the API and stores the JWT in an httpOnly cookie. */
export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the API. Is the backend running?" },
      { status: 502 }
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: data.error || "Login failed", details: data.details },
      { status: upstream.status }
    );
  }

  const res = NextResponse.json({ organization: data.organization });
  res.cookies.set(SESSION_COOKIE, data.token, sessionCookieOptions());
  return res;
}
