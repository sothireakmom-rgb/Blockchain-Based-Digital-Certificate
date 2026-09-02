import { redirect } from "next/navigation";
import AuthForm from "@/app/components/AuthForm";
import { getOrganization } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Certificate Registry" };

export default async function LoginPage() {
  // Already signed in? Skip straight to the dashboard.
  if (await getOrganization()) redirect("/dashboard");
  return <AuthForm mode="login" />;
}
