import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createOwner } from "../actions";
import { OwnerFields } from "@/components/record-forms";
import { Card, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "New client" };

export default async function NewClient({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireStaff();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="New client" back={{ href: "/clients", label: "Clients" }}
        subtitle="Tip: it's usually faster to send the client the New Visit form link and let them fill this in." />
      <Flash params={sp} />
      {sp.dupe && <p className="mb-4 text-sm"><Link className="font-medium text-brand-700 underline" href={`/clients/${sp.dupe}`}>Open the existing client →</Link></p>}
      <Card>
        <form action={createOwner} className="space-y-4">
          <OwnerFields />
          {sp.dupe && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm_duplicate" value="yes" /> This is a different person — create anyway</label>
          )}
          <SubmitButton>Create client</SubmitButton>
        </form>
      </Card>
    </>
  );
}
