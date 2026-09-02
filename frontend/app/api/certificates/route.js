import { NextResponse } from "next/server";
import { API_URL, getToken } from "@/lib/session";

/** Issues a certificate on behalf of the logged-in org, adding the bearer token. */
export async function POST(request) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(`${API_URL}/api/certificates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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
  return NextResponse.json(data, { status: upstream.status });
}
