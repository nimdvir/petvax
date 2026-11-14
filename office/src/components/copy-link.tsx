"use client";
import { useState } from "react";

/** Shows a form link with copy / text / email shortcuts. */
export function CopyLink({ url, phone, email, name }: { url: string; phone?: string | null; email?: string | null; name?: string | null }) {
  const [copied, setCopied] = useState(false);
  const text = `Hi${name ? ` ${name}` : ""}, here is your PetVax form: ${url}`;
  const digits = phone?.replace(/\D/g, "");
  return (
    <div className="space-y-2">
      <input readOnly value={url} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Form link" data-testid="form-link" />
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-2" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
        {digits && <a className="rounded-lg border border-gray-300 px-3 py-2" href={`sms:${digits}?&body=${encodeURIComponent(text)}`}>Text</a>}
        {email && <a className="rounded-lg border border-gray-300 px-3 py-2" href={`mailto:${email}?subject=${encodeURIComponent("Your PetVax form")}&body=${encodeURIComponent(text)}`}>Email</a>}
        <a className="rounded-lg border border-gray-300 px-3 py-2" href={url} target="_blank" rel="noreferrer">Open</a>
      </div>
    </div>
  );
}
