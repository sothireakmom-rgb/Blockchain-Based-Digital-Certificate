import Link from "next/link";

/** Page frame shared by the verify result, error, and not-found states. */
export default function Shell({ children }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <span aria-hidden="true">←</span> Verify another certificate
      </Link>
      {children}
    </main>
  );
}
