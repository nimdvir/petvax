import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublicForm } from "@/lib/forms/public";
import { FormRenderer } from "@/components/form-renderer";

export const dynamic = "force-dynamic";
export const metadata = { title: "PetVax form", robots: { index: false, follow: false } };

export default async function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await loadPublicForm(createAdminClient(), token);
  if (!form) notFound();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt={form.business.name} className="h-10 w-auto rounded" />
          <div className="text-sm text-gray-600">
            {form.business.phone && <div>Questions? Text or call {form.business.phone}</div>}
            {form.business.email && <div>{form.business.email}</div>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <FormRenderer schema={form.schema} consentText={form.consentText} title={form.templateTitle}
          description={form.templateDescription} endpoint={`/api/public/forms/${token}`} />
        <p className="mt-6 text-center text-xs text-gray-500">Your information is sent securely to {form.business.name} and is only visible to our staff.</p>
      </main>
    </div>
  );
}
