"use client";

import { usePathname } from "next/navigation";

/**
 * Echoes the certificate ID from the URL.
 *
 * not-found.js receives no route params, so this small client component reads
 * it from the pathname. It is deliberately the ONLY client-rendered part of
 * the not-found page - the explanatory copy stays server-rendered so it is
 * present in the initial HTML for crawlers and no-JS clients.
 */
export default function SearchedCertificateId() {
  const pathname = usePathname() || "";
  const raw = pathname.split("/").filter(Boolean).pop() || "";

  let certificateId = raw;
  try {
    certificateId = decodeURIComponent(raw);
  } catch {
    /* keep the raw segment if it is not valid encoding */
  }

  if (!certificateId) return null;

  return (
    <>
      {" "}
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-slate-800">
        {certificateId}
      </code>
    </>
  );
}
