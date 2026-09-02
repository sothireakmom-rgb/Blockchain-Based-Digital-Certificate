"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NavBar({ organizationName }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // refresh() clears the cached server render so the dashboard cannot be
      // shown from cache after the cookie is gone.
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f4c81] text-sm font-bold text-white"
          >
            ✓
          </span>
          <span className="text-sm font-semibold text-slate-900">
            Certificate Registry
          </span>
        </Link>

        <div className="flex items-center gap-4">
          {organizationName ? (
            <span className="hidden text-sm text-slate-600 sm:inline">
              Signed in as{" "}
              <span className="font-medium text-slate-900">{organizationName}</span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? "Signing out…" : "Log out"}
          </button>
        </div>
      </div>
    </header>
  );
}
