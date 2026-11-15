"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export default function UpdatePasswordPage() {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== String(f.get("confirm"))) return setError("Passwords don't match.");
    const { error } = await createClient().auth.updateUser({ password });
    if (error) setError(error.message);
    else window.location.assign("/?ok=" + encodeURIComponent("Password updated."));
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold">Choose a new password</h1>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Field label="New password" hint="At least 12 characters."><Input name="password" type="password" autoComplete="new-password" required /></Field>
        <Field label="Confirm password"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
        <Button className="w-full">Save password</Button>
      </form>
    </main>
  );
}
