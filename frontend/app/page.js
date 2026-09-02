"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    const id = value.trim().toUpperCase();
    if (!id) {
      setError("Enter a certificate ID to continue.");
      return;
    }
    setError("");
    router.push(`/verify/${encodeURIComponent(id)}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <div className="mb-10">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f4c81] text-lg font-bold text-white"
          >
            ✓
          </span>
          <span className="text-sm font-semibold tracking-widest text-slate-500 uppercase">
            Certificate Registry
          </span>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Verify a certificate
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          Enter the certificate ID printed on the document, or scan its QR code.
          Every certificate is anchored on the Ethereum blockchain, so its status
          is checked against the public ledger — not just our records.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <label
          htmlFor="certificateId"
          className="block text-sm font-medium text-slate-700"
        >
          Certificate ID
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="certificateId"
            name="certificateId"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="CERT-2026-A1B2C3"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "certificateId-error" : undefined}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-mono text-base tracking-wide text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-[#0f4c81] focus:ring-2 focus:ring-[#0f4c81]/20"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-[#0f4c81] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#0d3f6b] focus:outline-none focus:ring-2 focus:ring-[#0f4c81]/40"
          >
            Verify
          </button>
        </div>
        {error ? (
          <p id="certificateId-error" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </form>

      <p className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-500">
        Certificate IDs look like{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
          CERT-2026-A1B2C3
        </code>
        . Verification is public and requires no account.
      </p>
    </main>
  );
}
