"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-[#0f4c81] focus:ring-2 focus:ring-[#0f4c81]/20";

/**
 * Shared login/register form. Posts to the Next route handler, which stores
 * the JWT in an httpOnly cookie - the token never touches client JS.
 */
export default function AuthForm({ mode }) {
  const isRegister = mode === "register";
  const router = useRouter();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setDetails([]);
    setBusy(true);

    const body = isRegister
      ? form
      : { email: form.email, password: form.password };

    try {
      const res = await fetch(`/api/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setDetails(Array.isArray(data.details) ? data.details : []);
        setBusy(false);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f4c81] text-base font-bold text-white"
          >
            ✓
          </span>
          <span className="text-sm font-semibold tracking-widest text-slate-500 uppercase">
            Certificate Registry
          </span>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {isRegister ? "Create an organization" : "Sign in"}
        </h1>
        <p className="mt-2 text-slate-600">
          {isRegister
            ? "Register your organization to start issuing certificates."
            : "Sign in to issue and manage your certificates."}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {error ? (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
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

        {isRegister ? (
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Organization name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="organization"
              required
              value={form.name}
              onChange={update("name")}
              placeholder="Northgate Polytechnic"
              className={`mt-1.5 ${INPUT}`}
            />
          </div>
        ) : null}

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update("email")}
            placeholder="registrar@example.edu"
            className={`mt-1.5 ${INPUT}`}
          />
        </div>

        <div className="mb-6">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            value={form.password}
            onChange={update("password")}
            className={`mt-1.5 ${INPUT}`}
          />
          {isRegister ? (
            <p className="mt-1.5 text-xs text-slate-500">
              At least 8 characters.
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[#0f4c81] px-4 py-2.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#0d3f6b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? isRegister
              ? "Creating…"
              : "Signing in…"
            : isRegister
              ? "Create organization"
              : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {isRegister ? "Already registered? " : "Need an account? "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-[#0f4c81] underline underline-offset-2 hover:text-[#0d3f6b]"
        >
          {isRegister ? "Sign in" : "Register your organization"}
        </Link>
      </p>
    </main>
  );
}
