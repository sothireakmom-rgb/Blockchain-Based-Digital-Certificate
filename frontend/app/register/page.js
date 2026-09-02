import { redirect } from "next/navigation";
import AuthForm from "@/app/components/AuthForm";
import { getOrganization } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register — Certificate Registry" };

export default async function RegisterPage() {
  if (await getOrganization()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}
