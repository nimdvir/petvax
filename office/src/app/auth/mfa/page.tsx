"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

/** Second sign-in step for staff who enrolled an authenticator app. */
export default function MfaPage() {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const supabase = createClient();
    const factors = await supabase.auth.mfa.listFactors();
    const factor = factors.data?.totp.find((f) => f.status === "verified");
    if (!factor) return setError("No authenticator is set up for this account.");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) setError("That code didn't work. Try the newest code from your app.");
    else window.location.assign("/");
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold">Enter your authenticator code</h1>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Field label="6-digit code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus /></Field>
        <Button className="w-full">Verify</Button>
      </form>
    </main>
  );
}
