import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { MfaSetup } from "./mfa-setup";

export const metadata = { title: "Sign-in security" };

export default async function SecurityPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Sign-in security" back={{ href: "/settings", label: "Settings" }} subtitle="Add an authenticator app (Google Authenticator, 1Password, Authy…) so a password alone can't open PetVax Office." />
      <MfaSetup />
    </>
  );
}
