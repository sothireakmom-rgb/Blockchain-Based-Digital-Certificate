"use client";

import Link from "next/link";
import { useState } from "react";
import StatusBadge from "./StatusBadge";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Dashboard table with inline revocation.
 *
 * Holds the rows in state so a revoked certificate updates in place, without
 * a full page reload.
 */
export default function CertificateTable({ certificates: initial }) {
  const [rows, setRows] = useState(initial);
  const [confirming, setConfirming] = useState(null); // certificate pending confirmation
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function revoke(certificate) {
    setConfirming(null);
    setBusyId(certificate.certificateId);
    setError("");

    try {
      const res = await fetch(
        `/api/certificates/${encodeURIComponent(certificate.certificateId)}/revoke`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 409 means it is already revoked - the table is simply stale, so
        // reflect reality rather than showing a dead-end error.
        if (res.status === 409) {
          setRows((rs) =>
            rs.map((r) =>
              r.certificateId === certificate.certificateId
                ? { ...r, status: "Revoked" }
                : r
            )
          );
        }
        setError(data.error || "Could not revoke the certificate.");
        setBusyId(null);
        return;
      }

      setRows((rs) =>
        rs.map((r) =>
          r.certificateId === certificate.certificateId
            ? { ...r, status: data.certificate?.status || "Revoked" }
            : r
        )
      );
      setBusyId(null);
    } catch {
      setError("Could not reach the server. Nothing was changed.");
      setBusyId(null);
    }
  }

  return (
    <>
      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
        >
          <p className="text-sm font-medium text-red-800">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            className="shrink-0 text-sm font-medium text-red-700 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold text-slate-700">
                  Recipient
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-slate-700">
                  Course
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-slate-700">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-slate-700">
                  Issued
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-right font-semibold text-slate-700"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => {
                const busy = busyId === c.certificateId;
                return (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">
                        {c.recipientName}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        {c.certificateId}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{c.courseName}</td>
                    <td className="px-5 py-3.5">
                      {busy ? (
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-blue-800">
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700"
                          />
                          Revoking…
                        </span>
                      ) : (
                        <StatusBadge status={c.status} />
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">
                      {formatDate(c.issueDate)}
                      <div className="text-xs text-slate-400">
                        {c.expiryDate
                          ? `expires ${formatDate(c.expiryDate)}`
                          : "no expiry"}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <a
                          href={`/api/certificates/${encodeURIComponent(c.certificateId)}/pdf`}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          Download PDF
                        </a>
                        <Link
                          href={`/verify/${encodeURIComponent(c.certificateId)}`}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#0f4c81] underline underline-offset-2 transition hover:text-[#0d3f6b]"
                        >
                          View Verification Page
                        </Link>
                        {c.status !== "Revoked" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirming(c)}
                            className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busy ? "Revoking…" : "Revoke"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirming(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="revoke-title" className="text-lg font-bold text-slate-900">
              Revoke this certificate?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This cannot be undone — are you sure? Revoking writes permanently
              to the blockchain. The certificate for{" "}
              <span className="font-medium text-slate-900">
                {confirming.recipientName}
              </span>{" "}
              (
              <span className="font-mono text-xs">
                {confirming.certificateId}
              </span>
              ) will immediately show as <strong>Revoked</strong> on its public
              verification page.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => revoke(confirming)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Yes, revoke it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
