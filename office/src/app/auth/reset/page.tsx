"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export default function ResetPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    if (error) setError(error.message);
    else setSent(true);
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-bold">Reset your password</h1>
        {sent ? (
          <p className="text-sm text-gray-700">If that email belongs to a PetVax Office account, a reset link is on its way.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Field label="Email"><Input name="email" type="email" required autoComplete="username" /></Field>
            <Button className="w-full">Send reset link</Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm"><Link className="text-brand-700 hover:underline" href="/login">Back to sign in</Link></p>
      </div>
    </main>
  );
}
