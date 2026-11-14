"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

export function MfaSetup() {
  const supabase = createClient();
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => setFactors((await supabase.auth.mfa.listFactors()).data?.totp ?? []);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `PetVax ${new Date().toISOString().slice(0, 10)}` });
    if (error) return setMessage(error.message);
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll!.id, code });
    if (error) return setMessage("That code didn't match. Try the newest one.");
    setEnroll(null);
    setMessage("Authenticator app added. You'll be asked for a code when you sign in.");
    load();
  }
  async function remove(id: string) {
    if (!confirm("Remove this authenticator?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setMessage(error ? error.message : "Removed.");
    load();
  }
  const verified = factors.filter((f) => f.status === "verified");
  return (
    <Card>
      {message && <p role="status" className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">{message}</p>}
      {verified.length ? (
        <ul className="mb-4 space-y-2 text-sm">{verified.map((f) => <li key={f.id} className="flex justify-between">✓ {f.friendly_name ?? "Authenticator"} <button className="text-red-700 underline" onClick={() => remove(f.id)}>Remove</button></li>)}</ul>
      ) : <p className="mb-4 text-sm">Two-step sign-in is <strong>off</strong>.</p>}
      {enroll ? (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm">Scan this with your authenticator app, then enter the 6-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="Authenticator QR code" className="h-48 w-48 rounded border bg-white p-2" />
          <p className="break-all text-xs text-gray-500">Or enter this key: {enroll.secret}</p>
          <Field label="Code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" required /></Field>
          <Button>Turn on</Button>
        </form>
      ) : !verified.length && <Button onClick={start}>Set up authenticator app</Button>}
    </Card>
  );
}
