import Shell from "../../components/Shell";
import SearchedCertificateId from "../../components/SearchedCertificateId";

/**
 * Rendered when the page calls notFound(), which also sets the HTTP status to
 * 404. This is a server component so the explanatory copy ships in the initial
 * HTML; only the echoed ID (which is not available as a route param here) is
 * filled in on the client.
 */
export default function CertificateNotFound() {
  return (
    <Shell>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 bg-slate-400" />
        <div className="px-6 py-10 text-center sm:px-10">
          <div
            aria-hidden="true"
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-500"
          >
            ?
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Certificate not found
          </h1>
          <p className="mx-auto mt-3 max-w-md text-slate-600">
            No certificate exists with the ID
            <SearchedCertificateId />. Check the ID for typos, or ask the issuer
            to confirm it.
          </p>
          <p className="mt-6 text-sm text-slate-500">
            A missing record means this document was not issued through this
            registry. Treat it as unverified.
          </p>
        </div>
      </div>
    </Shell>
  );
}
