import Link from "next/link";
import NavBar from "@/app/components/NavBar";
import IssueForm from "@/app/components/IssueForm";
import { requireOrganization } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Issue certificate — Certificate Registry" };

export default async function IssuePage() {
  const organization = await requireOrganization();

  return (
    <>
      <NavBar organizationName={organization.name} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-800"
        >
          <span aria-hidden="true">←</span> Back to dashboard
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Issue a certificate
        </h1>
        <p className="mt-1.5 mb-8 text-slate-600">
          The certificate is anchored on the Ethereum Sepolia blockchain, then a
          verifiable PDF is generated automatically.
        </p>

        <IssueForm />
      </main>
    </>
  );
}
