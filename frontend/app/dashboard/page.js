import Link from "next/link";
import NavBar from "@/app/components/NavBar";
import CertificateTable from "@/app/components/CertificateTable";
import { API_URL, getToken, requireOrganization } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Certificate Registry" };

async function fetchCertificates(token) {
  try {
    const res = await fetch(`${API_URL}/api/certificates`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { error: `API returned ${res.status}`, certificates: [] };
    const data = await res.json();
    return { certificates: data.certificates || [] };
  } catch (err) {
    return { error: err.message, certificates: [] };
  }
}

export default async function DashboardPage() {
  const organization = await requireOrganization();
  const token = await getToken();
  const { certificates, error } = await fetchCertificates(token);

  return (
    <>
      <NavBar organizationName={organization.name} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Certificates
            </h1>
            <p className="mt-1.5 text-slate-600">
              {certificates.length === 0
                ? "No certificates issued yet."
                : `${certificates.length} certificate${certificates.length === 1 ? "" : "s"} issued by ${organization.name}.`}
            </p>
          </div>
          <Link
            href="/dashboard/issue"
            className="rounded-lg bg-[#0f4c81] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d3f6b]"
          >
            Issue New Certificate
          </Link>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              Could not load certificates
            </p>
            <p className="mt-1 text-sm text-amber-700">{error}</p>
          </div>
        ) : null}

        {certificates.length === 0 && !error ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-base font-medium text-slate-900">
              Nothing here yet
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
              Issue your first certificate and it will be anchored on the Ethereum
              blockchain, with a verifiable PDF ready to send.
            </p>
            <Link
              href="/dashboard/issue"
              className="mt-6 inline-block rounded-lg bg-[#0f4c81] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d3f6b]"
            >
              Issue New Certificate
            </Link>
          </div>
        ) : null}

        {certificates.length > 0 ? (
          <CertificateTable certificates={certificates} />
        ) : null}

      </main>
    </>
  );
}
