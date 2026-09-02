import { notFound } from "next/navigation";
import Shell from "../../components/Shell";

// Always hit the API fresh - a revocation must show up immediately.
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const STATUS_STYLES = {
  Valid: {
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    label: "Valid",
    blurb: "This certificate is genuine and currently in force.",
  },
  Expired: {
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    label: "Expired",
    blurb: "This certificate was genuine but has passed its expiry date.",
  },
  Revoked: {
    badge: "bg-red-50 text-red-800 ring-red-600/20",
    dot: "bg-red-500",
    bar: "bg-red-500",
    label: "Revoked",
    blurb: "This certificate was withdrawn by the issuing organization.",
  },
};

const UNKNOWN_STATUS = {
  badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
  dot: "bg-slate-400",
  bar: "bg-slate-400",
  label: "Unknown",
  blurb: "The status of this certificate could not be determined.",
};

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function fetchCertificate(certificateId) {
  try {
    const res = await fetch(
      `${API_URL}/api/certificates/verify/${encodeURIComponent(certificateId)}`,
      { cache: "no-store" }
    );
    if (res.status === 404) return { state: "not-found" };
    if (!res.ok) return { state: "error", detail: `API returned ${res.status}` };
    return { state: "ok", data: await res.json() };
  } catch (err) {
    return { state: "error", detail: err.message };
  }
}

function Field({ label, value, mono = false }) {
  return (
    <div className="border-t border-slate-200 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 text-slate-900 sm:col-span-2 sm:mt-0 ${
          mono ? "font-mono text-sm break-all" : "text-base"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export async function generateMetadata({ params }) {
  const { certificateId } = await params;
  return { title: `Verify ${certificateId} — Certificate Registry` };
}

export default async function VerifyPage({ params }) {
  const { certificateId } = await params;
  const result = await fetchCertificate(certificateId);

  // Renders not-found.js in this segment and responds with a real HTTP 404.
  if (result.state === "not-found") {
    notFound();
  }

  if (result.state === "error") {
    return (
      <Shell>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-1.5 bg-amber-500" />
          <div className="px-6 py-10 text-center sm:px-10">
            <h1 className="text-2xl font-bold text-slate-900">
              Verification unavailable
            </h1>
            <p className="mx-auto mt-3 max-w-md text-slate-600">
              We could not reach the verification service. This does not mean the
              certificate is invalid — please try again shortly.
            </p>
            <p className="mt-4 font-mono text-xs text-slate-400">
              {result.detail}
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const cert = result.data;
  const style = STATUS_STYLES[cert.status] || UNKNOWN_STATUS;
  const expiry = cert.expiryDate ? formatDate(cert.expiryDate) : "No Expiry";
  const tampered = cert.onChain?.found && cert.onChain.dataHashMatches === false;

  return (
    <Shell>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className={`h-1.5 ${style.bar}`} />

        <div className="px-6 py-8 sm:px-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
                Certificate of Completion
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                {cert.recipientName}
              </h1>
              <p className="mt-1 text-lg text-slate-700">{cert.courseName}</p>
            </div>

            <span
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset ${style.badge}`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${style.dot}`}
              />
              {style.label}
            </span>
          </div>

          <p className="mt-4 text-sm text-slate-600">{style.blurb}</p>

          {tampered ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-800">
                Warning: record mismatch
              </p>
              <p className="mt-1 text-sm text-red-700">
                The stored details do not match the hash recorded on-chain. This
                certificate&apos;s data may have been altered after issuing.
              </p>
            </div>
          ) : null}

          <dl className="mt-8">
            <Field label="Issued by" value={cert.organizationName} />
            <Field label="Issue date" value={formatDate(cert.issueDate)} />
            <Field label="Expiry date" value={expiry} />
            <Field label="Certificate ID" value={cert.certificateId} mono />
            <Field
              label="Status verified via"
              value={
                cert.statusSource === "blockchain"
                  ? "Ethereum Sepolia (live contract call)"
                  : "Local records (blockchain unreachable)"
              }
            />
            <Field
              label="Blockchain record"
              value={
                <a
                  href={cert.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-[#0f4c81] underline underline-offset-2 hover:text-[#0d3f6b]"
                >
                  View transaction on Sepolia Etherscan
                  <span aria-hidden="true">↗</span>
                </a>
              }
            />
            <Field label="Transaction hash" value={cert.txHash} mono />
          </dl>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-10">
          <p className="text-xs leading-relaxed text-slate-500">
            This certificate&apos;s status was read directly from the
            CertificateRegistry smart contract on the Ethereum Sepolia network.
            Anyone can independently confirm it using the transaction link above.
          </p>
        </div>
      </div>
    </Shell>
  );
}
