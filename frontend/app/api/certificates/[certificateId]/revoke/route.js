import { NextResponse } from "next/server";
import { API_URL, getToken } from "@/lib/session";

/** Revokes a certificate on behalf of the signed-in org. */
export async function POST(request, { params }) {
  const { certificateId } = await params;

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let upstream;
  try {
    upstream = await fetch(
      `${API_URL}/api/certificates/${encodeURIComponent(certificateId)}/revoke`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach the API. Is the backend running?" },
      { status: 502 }
    );
  }

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
