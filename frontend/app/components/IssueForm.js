"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-[#0f4c81] focus:ring-2 focus:ring-[#0f4c81]/20 disabled:bg-slate-50 disabled:text-slate-400";

export default function IssueForm() {
  const router = useRouter();

  const [form, setForm] = useState({
    recipientName: "",
    recipientEmail: "",
    courseName: "",
    expiryDate: "",
  });
  const [noExpiry, setNoExpiry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [result, setResult] = useState(null);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setDetails([]);
    setBusy(true);

    // The API wants an ISO datetime, or null for "never expires".
    const expiryDate =
      noExpiry || !form.expiryDate
        ? null
        : new Date(`${form.expiryDate}T23:59:59`).toISOString();

    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expiryDate }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Could not issue the certificate.");
        setDetails(Array.isArray(data.details) ? data.details : []);
        setBusy(false);
        return;
      }

      setResult(data);
      setBusy(false);
      // Make sure the dashboard table shows the new row when we go back.
      router.refresh();
    } catch {
      setError("Could not reach the server. The certificate was not issued.");
      setBusy(false);
    }
  }

  if (result) {
    const cert = result.certificate;
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 bg-emerald-500" />
        <div className="px-6 py-8 sm:px-8">
          <div
            aria-hidden="true"
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-600"
          >
            ✓
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            Certificate issued
          </h2>
          <p className="mt-2 text-slate-600">
            <span className="font-medium text-slate-900">
              {cert.recipientName}
            </span>{" "}
            has been issued a certificate for {cert.courseName}. It is now
            anchored on the Ethereum Sepolia blockchain.
          </p>

          <dl className="mt-6 space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Certificate ID</dt>
              <dd className="font-mono font-medium text-slate-900">
                {cert.certificateId}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Transaction</dt>
              <dd className="font-mono text-xs break-all text-slate-700">
                {cert.txHash}
              </dd>
            </div>
            {result.blockNumber ? (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">Block</dt>
                <dd className="font-medium text-slate-900">
                  {result.blockNumber}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`/api/certificates/${encodeURIComponent(cert.certificateId)}/pdf`}
              className="rounded-lg bg-[#0f4c81] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d3f6b]"
            >
              Download PDF
            </a>
            <Link
              href={`/verify/${encodeURIComponent(cert.certificateId)}`}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View certificate
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
        >
          <p className="text-sm font-medium text-red-800">{error}</p>
          {details.length ? (
            <ul className="mt-1.5 list-inside list-disc text-sm text-red-700">
              {details.map((d, i) => (
                <li key={i}>
                  {d.field}: {d.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mb-5">
        <label
          htmlFor="recipientName"
          className="block text-sm font-medium text-slate-700"
        >
          Recipient name
        </label>
        <input
          id="recipientName"
          name="recipientName"
          type="text"
          required
          disabled={busy}
          value={form.recipientName}
          onChange={update("recipientName")}
          placeholder="Ada Lovelace"
          className={`mt-1.5 ${INPUT}`}
        />
      </div>

      <div className="mb-5">
        <label
          htmlFor="recipientEmail"
          className="block text-sm font-medium text-slate-700"
        >
          Recipient email
        </label>
        <input
          id="recipientEmail"
          name="recipientEmail"
          type="email"
          required
          disabled={busy}
          value={form.recipientEmail}
          onChange={update("recipientEmail")}
          placeholder="ada@example.com"
          className={`mt-1.5 ${INPUT}`}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Kept private — never shown on the public verification page.
        </p>
      </div>

      <div className="mb-5">
        <label
          htmlFor="courseName"
          className="block text-sm font-medium text-slate-700"
        >
          Course name
        </label>
        <input
          id="courseName"
          name="courseName"
          type="text"
          required
          disabled={busy}
          value={form.courseName}
          onChange={update("courseName")}
          placeholder="BSc Computer Science"
          className={`mt-1.5 ${INPUT}`}
        />
      </div>

      <fieldset className="mb-7">
        <legend className="block text-sm font-medium text-slate-700">
          Expiry
        </legend>
        <label className="mt-2 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={noExpiry}
            disabled={busy}
            onChange={(e) => setNoExpiry(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[#0f4c81] focus:ring-[#0f4c81]/30"
          />
          <span className="text-sm text-slate-700">
            This certificate never expires
          </span>
        </label>

        <input
          id="expiryDate"
          name="expiryDate"
          type="date"
          disabled={busy || noExpiry}
          required={!noExpiry}
          value={form.expiryDate}
          onChange={update("expiryDate")}
          aria-label="Expiry date"
          className={`mt-3 ${INPUT}`}
        />
        {!noExpiry ? (
          <p className="mt-1.5 text-xs text-slate-500">
            Must be a future date.
          </p>
        ) : null}
      </fieldset>

      {busy ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700"
            />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Writing to the blockchain…
              </p>
              <p className="mt-0.5 text-sm text-blue-800">
                Waiting for the Sepolia transaction to confirm. This usually
                takes 10–20 seconds — please keep this page open.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="w-full rounded-lg bg-[#0f4c81] px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#0d3f6b] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Issuing certificate…" : "Issue certificate"}
      </button>
    </form>
  );
}
