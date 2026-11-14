"use client";
import { useCallback, useMemo, useState } from "react";
import type { AnswerGroup, FormField, FormSchema } from "@/lib/forms/schema";
import { US_STATES, isVisible } from "@/lib/forms/schema";
import { SignaturePad } from "./signature-pad";

type Values = Record<string, unknown>;

interface Props {
  schema: FormSchema;
  consentText: string | null;
  title: string;
  description: string | null;
  /** POST endpoint; omit for a non-submitting preview. */
  endpoint?: string;
}

const inputCls = (bad?: boolean) =>
  `mt-1 block w-full rounded-lg border ${bad ? "border-red-500" : "border-gray-300"} bg-white px-3 py-3 text-gray-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700`;

function emptyGroup(): Values {
  return {};
}

function FieldInput({ field, value, onChange, error, name }: { field: FormField; value: unknown; onChange: (v: unknown) => void; error?: string; name: string }) {
  const id = `f-${name}`;
  const describedBy = error ? `${id}-err` : field.help ? `${id}-help` : undefined;
  const label = (
    <span className="text-sm font-medium text-gray-800">
      {field.label}{field.required && <span className="text-brand-700" aria-hidden> *</span>}
    </span>
  );
  const help = field.help && <span id={`${id}-help`} className="mt-1 block text-xs text-gray-500">{field.help}</span>;
  const err = error && <span id={`${id}-err`} role="alert" className="mt-1 block text-sm font-medium text-red-700">{error}</span>;
  const common = { id, name, "aria-invalid": !!error || undefined, "aria-describedby": describedBy, required: field.required };

  if (field.type === "info") {
    return <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{field.label}</p>;
  }
  if (field.type === "agree") {
    return (
      <div>
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-700" checked={value === true} onChange={(e) => onChange(e.target.checked)} {...common} />
          <span className="text-sm text-gray-800">{field.label}{field.required && <span className="text-brand-700"> *</span>}</span>
        </label>
        {err}
      </div>
    );
  }
  if (field.type === "radio" || field.type === "yesno") {
    const options = field.type === "yesno" ? [["yes", "Yes"], ["no", "No"]] : (field.options ?? []).map((o) => [o, o]);
    return (
      <fieldset aria-describedby={describedBy}>
        <legend>{label}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map(([v, l]) => (
            <label key={v} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${value === v ? "border-brand-700 bg-brand-50 text-brand-800" : "border-gray-300 bg-white"}`}>
              <input type="radio" className="h-4 w-4 accent-brand-700" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
              {l}
            </label>
          ))}
        </div>
        {help}{err}
      </fieldset>
    );
  }
  if (field.type === "checkboxes") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const other = arr.find((v) => v.startsWith("Other: "));
    const otherOn = other !== undefined;
    const toggle = (opt: string, on: boolean) => onChange(on ? [...arr, opt] : arr.filter((v) => v !== opt));
    return (
      <fieldset aria-describedby={describedBy}>
        <legend>{label}</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex min-h-[44px] items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-brand-700" checked={arr.includes(o)} onChange={(e) => toggle(o, e.target.checked)} />
              {o}
            </label>
          ))}
          {field.allowOther && (
            <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-brand-700" checked={otherOn}
                onChange={(e) => onChange(e.target.checked ? [...arr, "Other: "] : arr.filter((v) => !v.startsWith("Other: ")))} />
              Other
            </label>
          )}
        </div>
        {otherOn && (
          <input aria-label={`${field.label} — other`} className={inputCls()} placeholder="Please specify" value={other!.slice(7)}
            onChange={(e) => onChange(arr.map((v) => (v.startsWith("Other: ") ? `Other: ${e.target.value}` : v)))} />
        )}
        {help}{err}
      </fieldset>
    );
  }
  return (
    <label className="block" htmlFor={id}>
      {label}
      {field.type === "textarea" ? (
        <textarea className={`${inputCls(!!error)} min-h-[96px]`} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} {...common} />
      ) : field.type === "select" || field.type === "state" ? (
        <select className={inputCls(!!error)} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} {...common}>
          <option value="">Please select</option>
          {(field.type === "state" ? US_STATES : field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          className={inputCls(!!error)}
          type={field.type === "phone" ? "tel" : field.type === "number" ? "text" : field.type}
          inputMode={field.type === "number" ? "decimal" : field.type === "phone" ? "tel" : undefined}
          autoComplete={
            ({ "owner.first_name": "given-name", "owner.last_name": "family-name", "owner.email": "email", "owner.phone": "tel",
               "owner.address_line1": "address-line1", "owner.address_line2": "address-line2", "owner.city": "address-level2",
               "owner.postal_code": "postal-code" } as Record<string, string>)[field.mapsTo ?? ""] ?? "off"
          }
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          {...common}
        />
      )}
      {help}{err}
    </label>
  );
}

export function FormRenderer({ schema, consentText, title, description, endpoint }: Props) {
  const repeat = schema.sections.find((s) => s.repeat);
  const [values, setValues] = useState<Values>(() => (repeat ? { [repeat.id]: [emptyGroup()] } : {}));
  const [signerName, setSignerName] = useState("");
  const [relationship, setRelationship] = useState(schema.consent?.relationshipOptions[0] ?? "");
  const [agreed, setAgreed] = useState(false);
  const [esignAgreed, setEsignAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot
  // One key per page load: double-taps and retries are saved only once.
  const [submissionKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null));

  const groups = useMemo(() => (repeat ? ((values[repeat.id] as Values[]) ?? []) : []), [values, repeat]);
  const clearError = (key: string) => setErrors((prev) => {
    if (!(key in prev)) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
  const setTop = (id: string, v: unknown) => { clearError(id); setValues((prev) => ({ ...prev, [id]: v })); };
  const setGroup = (i: number, id: string, v: unknown) => {
    clearError(`${repeat!.id}.${i}.${id}`);
    clearError(repeat!.id);
    setValues((prev) => {
      const arr = [...((prev[repeat!.id] as Values[]) ?? [])];
      arr[i] = { ...arr[i], [id]: v };
      return { ...prev, [repeat!.id]: arr };
    });
  };
  const onSignature = useCallback((d: string) => {
    setSignature(d);
    if (d) setErrors((prev) => { const n = { ...prev }; delete n["signature.dataUrl"]; return n; });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!endpoint) {
      setMessage("This is a preview. Submissions are turned off.");
      return;
    }
    setStatus("sending");
    setErrors({});
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: values,
          signature: schema.consent?.enabled ? { signerName, relationship, agreed, esignAgreed, dataUrl: signature } : null,
          website,
          submissionKey,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("done");
        setMessage(body.message ?? schema.confirmationMessage ?? "Thank you! Your form has been received.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setStatus("failed");
      setErrors(body.errors ?? {});
      setMessage(body.error ?? "Please fix the highlighted items and try again.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true], [role=alert]")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch {
      setStatus("failed");
      setMessage("We couldn't reach the server. Check your connection and try again — your answers are still here.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center" role="status">
        <p className="text-4xl" aria-hidden>✓</p>
        <h2 className="mt-2 text-xl font-bold text-green-900">Submitted</h2>
        <p className="mt-2 text-green-900">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-gray-600">{description}</p>}
        <p className="mt-2 text-xs text-gray-500"><span className="text-brand-700">*</span> required</p>
      </div>
      {message && status === "failed" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
      {message && !endpoint && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}

      {schema.sections.map((section) => (
        <section key={section.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
          {section.description && <p className="mt-1 text-sm text-gray-600">{section.description}</p>}
          {errors[section.id] && <p role="alert" className="mt-2 text-sm text-red-700">{errors[section.id]}</p>}
          {section.repeat ? (
            <div className="mt-4 space-y-6">
              {groups.map((g, i) => (
                <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4" data-testid={`pet-${i}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">{section.repeat!.itemLabel} {i + 1}{g.pet_name ? `: ${g.pet_name}` : ""}</h3>
                    {groups.length > section.repeat!.min && (
                      <button type="button" className="text-sm text-red-700 underline"
                        onClick={() => setValues((prev) => ({ ...prev, [section.id]: groups.filter((_, j) => j !== i) }))}>
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {section.fields.filter((f) => isVisible(f, g as AnswerGroup)).map((f) => (
                      <div key={f.id} className={["textarea", "checkboxes", "info", "agree"].includes(f.type) ? "sm:col-span-2" : ""}>
                        <FieldInput field={f} name={`${section.id}.${i}.${f.id}`} value={g[f.id]} error={errors[`${section.id}.${i}.${f.id}`]} onChange={(v) => setGroup(i, f.id, v)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {groups.length < section.repeat.max && (
                <button type="button" className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 font-medium text-brand-700 hover:border-brand-700"
                  onClick={() => setValues((prev) => ({ ...prev, [section.id]: [...groups, emptyGroup()] }))}>
                  + {section.repeat.addLabel}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.fields.filter((f) => isVisible(f, values as AnswerGroup)).map((f) => (
                <div key={f.id} className={["textarea", "checkboxes", "info", "agree"].includes(f.type) ? "sm:col-span-2" : ""}>
                  <FieldInput field={f} name={f.id} value={values[f.id]} error={errors[f.id]} onChange={(v) => setTop(f.id, v)} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {schema.consent?.enabled && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="consent-h">
          <h2 id="consent-h" className="text-lg font-semibold text-gray-900">{schema.consent.heading ?? "Consent"}</h2>
          <div className="mt-3 whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800" data-testid="consent-text">
            {consentText}
          </div>
          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-700" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); clearError("signature.agreed"); }} />
              <span className="text-sm">{schema.consent.agreeLabel} <span className="text-brand-700">*</span></span>
            </label>
            {errors["signature.agreed"] && <p role="alert" className="text-sm text-red-700">{errors["signature.agreed"]}</p>}
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-700" checked={esignAgreed} onChange={(e) => { setEsignAgreed(e.target.checked); clearError("signature.esignAgreed"); }} />
              <span className="text-sm">{schema.consent.esignLabel} <span className="text-brand-700">*</span></span>
            </label>
            {errors["signature.esignAgreed"] && <p role="alert" className="text-sm text-red-700">{errors["signature.esignAgreed"]}</p>}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Your full name <span className="text-brand-700">*</span></span>
              <input className={inputCls(!!errors["signature.signerName"])} value={signerName} onChange={(e) => { setSignerName(e.target.value); clearError("signature.signerName"); }} autoComplete="name" />
              {errors["signature.signerName"] && <span role="alert" className="mt-1 block text-sm text-red-700">{errors["signature.signerName"]}</span>}
            </label>
            <label className="block">
              <span className="text-sm font-medium">Relationship to the pet(s) <span className="text-brand-700">*</span></span>
              <select className={inputCls(!!errors["signature.relationship"])} value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                {schema.consent.relationshipOptions.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <span className="text-sm font-medium">Signature <span className="text-brand-700">*</span></span>
            <SignaturePad onChange={onSignature} invalid={!!errors["signature.dataUrl"]} />
            {errors["signature.dataUrl"] && <p role="alert" className="text-sm text-red-700">{errors["signature.dataUrl"]}</p>}
          </div>
          <p className="mt-3 text-xs text-gray-500">Signed {new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "long" })} (New York time)</p>
        </section>
      )}

      <div className="hidden" aria-hidden>
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      <button type="submit" disabled={status === "sending"}
        className="w-full rounded-xl bg-brand-700 py-4 text-lg font-semibold text-white shadow hover:bg-brand-800 disabled:opacity-60">
        {status === "sending" ? "Sending…" : schema.submitLabel ?? "Submit"}
      </button>
    </form>
  );
}
