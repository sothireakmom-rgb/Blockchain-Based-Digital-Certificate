import { NextResponse } from "next/server";
import { API_URL, getToken } from "@/lib/session";

/**
 * Streams the certificate PDF.
 *
 * The API requires an Authorization header, which a plain <a download> link
 * cannot send - so the browser hits this route, and the cookie is exchanged
 * for the bearer token here on the server.
 */
export async function GET(request, { params }) {
  const { certificateId } = await params;

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let upstream;
  try {
    upstream = await fetch(
      `${API_URL}/api/certificates/${encodeURIComponent(certificateId)}/pdf`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
  } catch {
    return NextResponse.json({ error: "Could not reach the API" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Certificate not found" },
      { status: upstream.status }
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${certificateId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
