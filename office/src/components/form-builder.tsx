"use client";
import { useMemo, useState, useTransition } from "react";
import type { FieldType, FormField, FormSchema, FormSection, MapTarget } from "@/lib/forms/schema";
import { APPOINTMENT_TARGETS, FIELD_TYPES, OWNER_TARGETS, PET_TARGETS } from "@/lib/forms/schema";
import { publishForm, saveFormDraft, type SaveResult } from "@/app/(office)/forms/actions";
import { FormRenderer } from "./form-renderer";

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Short answer", textarea: "Long answer", email: "Email", phone: "Phone", number: "Number", date: "Date",
  select: "Dropdown", radio: "Multiple choice (one)", checkboxes: "Checkboxes (many)", yesno: "Yes / No",
  agree: "Must-tick agreement", state: "US state", info: "Text / instructions (no answer)",
};
const TARGET_LABEL = (t: string) => t.replace(/^(owner|pet|appointment)\./, "").replace(/\./g, " ").replace(/_/g, " ");
const cls = "mt-1 block w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "q_$1").slice(0, 40) || "q";

function uniqueId(base: string, used: Set<string>) {
  let id = slug(base);
  if (!/^[a-z]/.test(id)) id = `q_${id}`;
  let n = 2;
  const root = id;
  while (used.has(id)) id = `${root}_${n++}`;
  return id;
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

function FieldEditor({ field, section, siblings, onChange, onRemove, onMove, onDuplicate, usedTargets }: {
  field: FormField; section: FormSection; siblings: FormField[]; usedTargets: Set<string>;
  onChange: (f: FormField) => void; onRemove: () => void; onMove: (d: number) => void; onDuplicate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const targets: readonly MapTarget[] = section.repeat ? PET_TARGETS : [...OWNER_TARGETS, ...APPOINTMENT_TARGETS];
  const needsOptions = ["select", "radio", "checkboxes"].includes(field.type);
  return (
    <li className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 p-2">
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block truncate text-sm font-medium">{field.label || "Untitled question"}{field.required && <span className="text-brand-700"> *</span>}</span>
          <span className="block text-xs text-gray-500">{TYPE_LABELS[field.type]}{field.mapsTo && ` → saves to ${field.mapsTo.split(".")[0]} ${TARGET_LABEL(field.mapsTo)}`}{field.showIf && " · conditional"}</span>
        </button>
        <div className="flex shrink-0 gap-1 text-gray-500">
          <button type="button" aria-label="Move up" className="rounded px-2 py-1 hover:bg-gray-100" onClick={() => onMove(-1)}>↑</button>
          <button type="button" aria-label="Move down" className="rounded px-2 py-1 hover:bg-gray-100" onClick={() => onMove(1)}>↓</button>
        </div>
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="text-xs font-medium">{field.type === "info" ? "Text shown" : "Question"}</span>
            <textarea rows={field.type === "info" || field.type === "agree" ? 3 : 1} className={cls} value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} /></label>
          <label className="block"><span className="text-xs font-medium">Answer type</span>
            <select className={cls} value={field.type} onChange={(e) => {
              const type = e.target.value as FieldType;
              onChange({ ...field, type, options: ["select", "radio", "checkboxes"].includes(type) ? field.options ?? ["Option 1"] : undefined });
            }}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select></label>
          {field.type !== "info" && (
            <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ ...field, required: e.target.checked || undefined })} /> Required</label>
          )}
          {needsOptions && (
            <label className="block sm:col-span-2"><span className="text-xs font-medium">Choices (one per line)</span>
              <textarea rows={4} className={cls} value={(field.options ?? []).join("\n")}
                onChange={(e) => onChange({ ...field, options: e.target.value.split("\n").map((s) => s.trimStart()).filter((s, i, a) => s || i === a.length - 1) })}
                onBlur={(e) => onChange({ ...field, options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} /></label>
          )}
          {field.type === "checkboxes" && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!field.allowOther} onChange={(e) => onChange({ ...field, allowOther: e.target.checked || undefined })} /> Allow &ldquo;Other&rdquo; with text</label>
          )}
          {field.type !== "info" && (
            <label className="block sm:col-span-2"><span className="text-xs font-medium">Help text (optional)</span>
              <input className={cls} value={field.help ?? ""} onChange={(e) => onChange({ ...field, help: e.target.value || undefined })} /></label>
          )}
          {field.type !== "info" && field.type !== "agree" && (
            <label className="block"><span className="text-xs font-medium">Save answer to record</span>
              <select className={cls} value={field.mapsTo ?? ""} onChange={(e) => onChange({ ...field, mapsTo: (e.target.value || undefined) as MapTarget | undefined })}>
                <option value="">Keep with submission only</option>
                {targets.map((t) => <option key={t} value={t} disabled={usedTargets.has(t) && t !== field.mapsTo}>{t.split(".")[0]}: {TARGET_LABEL(t)}{usedTargets.has(t) && t !== field.mapsTo ? " (used)" : ""}</option>)}
              </select></label>
          )}
          <div className="block">
            <span className="text-xs font-medium">Only show when…</span>
            <div className="mt-1 flex gap-1">
              <select className={cls} value={field.showIf?.field ?? ""} onChange={(e) => onChange({ ...field, showIf: e.target.value ? { field: e.target.value, equals: field.showIf?.equals ?? "yes" } : undefined })}>
                <option value="">Always show</option>
                {siblings.filter((s) => s.id !== field.id && ["yesno", "radio", "select", "checkboxes"].includes(s.type)).map((s) => <option key={s.id} value={s.id}>{s.label.slice(0, 40)}</option>)}
              </select>
              {field.showIf && (() => {
                const src = siblings.find((s) => s.id === field.showIf!.field);
                const opts = src?.type === "yesno" ? ["yes", "no"] : src?.options ?? [];
                return <select aria-label="equals" className={cls} value={field.showIf.equals} onChange={(e) => onChange({ ...field, showIf: { ...field.showIf!, equals: e.target.value } })}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
              })()}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <span className="text-[11px] text-gray-400">Internal id: {field.id}</span>
            <div className="flex gap-2 text-sm">
              <button type="button" className="rounded border px-2 py-1" onClick={onDuplicate}>Duplicate</button>
              <button type="button" className="rounded border border-red-300 px-2 py-1 text-red-700" onClick={() => { if (confirm("Delete this question? Past answers are kept.")) onRemove(); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export function FormBuilder({ templateId, initial }: { templateId: string; initial: { schema: FormSchema; consentText: string; title: string; description: string } }) {
  const [schema, setSchema] = useState<FormSchema>(initial.schema);
  const [consentText, setConsentText] = useState(initial.consentText);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [changeNote, setChangeNote] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [result, setResult] = useState<SaveResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const allIds = useMemo(() => new Set(schema.sections.flatMap((s) => [s.id, ...s.fields.map((f) => f.id)])), [schema]);
  const usedTargets = useMemo(() => new Set(schema.sections.flatMap((s) => s.fields.map((f) => f.mapsTo).filter(Boolean) as string[])), [schema]);

  const update = (fn: (s: FormSchema) => FormSchema) => { setSchema(fn); setDirty(true); setResult(null); };
  const setSection = (i: number, sec: FormSection) => update((s) => ({ ...s, sections: s.sections.map((x, j) => (j === i ? sec : x)) }));

  const payload = () => ({ schema, consentText: schema.consent?.enabled ? consentText : null, title, description: description || null, changeNote: changeNote || null });
  const save = (publish: boolean) => start(async () => {
    const r = publish ? await publishForm(templateId, payload()) : await saveFormDraft(templateId, payload());
    setResult(r);
    if (r.ok) setDirty(false);
  });

  return (
    <div>
      <div className="sticky top-[104px] z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50/95 px-4 py-2 backdrop-blur">
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm" role="tablist">
          {(["edit", "preview"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-brand-700 text-white" : "text-gray-700"}`}>{t === "edit" ? "Edit" : "Preview (phone)"}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button type="button" disabled={pending} onClick={() => save(false)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold">Save draft</button>
          <button type="button" disabled={pending} onClick={() => { if (confirm("Publish now? New submissions will use this version.")) save(true); }} className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white">{pending ? "Working…" : "Publish"}</button>
        </div>
      </div>
      {result && (
        <div role="status" className={`mb-4 rounded-lg border p-3 text-sm ${result.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {result.message}
          {result.errors && <ul className="mt-1 list-disc pl-5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}

      {tab === "preview" ? (
        <div className="mx-auto max-w-md rounded-[2rem] border-8 border-gray-800 bg-gray-50 p-3 shadow-xl">
          <FormRenderer schema={schema} consentText={consentText} title={title} description={description} />
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="block"><span className="text-sm font-medium">Form title</span><input className={cls} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></label>
            <label className="mt-3 block"><span className="text-sm font-medium">Intro text</span><textarea rows={2} className={cls} value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} /></label>
          </section>

          {schema.sections.map((sec, si) => (
            <section key={sec.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <input aria-label="Section title" className={`${cls} font-semibold`} value={sec.title} onChange={(e) => setSection(si, { ...sec, title: e.target.value })} />
                  <input aria-label="Section description" placeholder="Section description (optional)" className={cls} value={sec.description ?? ""} onChange={(e) => setSection(si, { ...sec, description: e.target.value || undefined })} />
                  {sec.repeat && <p className="text-xs text-gray-600">🐾 Repeating section: clients can add up to {sec.repeat.max} pets. Questions here save to each pet.</p>}
                </div>
                <div className="flex gap-1 text-sm">
                  <button type="button" aria-label="Move section up" className="rounded border bg-white px-2 py-1" onClick={() => update((s) => ({ ...s, sections: move(s.sections, si, -1) }))}>↑</button>
                  <button type="button" aria-label="Move section down" className="rounded border bg-white px-2 py-1" onClick={() => update((s) => ({ ...s, sections: move(s.sections, si, 1) }))}>↓</button>
                  {!sec.repeat && <button type="button" className="rounded border border-red-300 bg-white px-2 py-1 text-red-700" onClick={() => { if (confirm("Delete this whole section?")) update((s) => ({ ...s, sections: s.sections.filter((_, j) => j !== si) })); }}>Delete</button>}
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {sec.fields.map((f, fi) => (
                  <FieldEditor key={f.id} field={f} section={sec} siblings={sec.fields} usedTargets={usedTargets}
                    onChange={(nf) => setSection(si, { ...sec, fields: sec.fields.map((x, j) => (j === fi ? nf : x)) })}
                    onRemove={() => setSection(si, { ...sec, fields: sec.fields.filter((_, j) => j !== fi) })}
                    onMove={(d) => setSection(si, { ...sec, fields: move(sec.fields, fi, d) })}
                    onDuplicate={() => {
                      const copy = { ...f, id: uniqueId(f.id, allIds), mapsTo: undefined, label: `${f.label} (copy)` };
                      setSection(si, { ...sec, fields: [...sec.fields.slice(0, fi + 1), copy, ...sec.fields.slice(fi + 1)] });
                    }} />
                ))}
              </ul>
              <button type="button" className="mt-3 w-full rounded-lg border-2 border-dashed border-gray-300 bg-white py-2 text-sm font-medium text-brand-700"
                onClick={() => setSection(si, { ...sec, fields: [...sec.fields, { id: uniqueId("new_question", allIds), label: "New question", type: "text" }] })}>
                + Add question
              </button>
            </section>
          ))}
          <button type="button" className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-700"
            onClick={() => update((s) => ({ ...s, sections: [...s.sections, { id: uniqueId("section", allIds), title: "New section", fields: [] }] }))}>
            + Add section
          </button>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={!!schema.consent?.enabled} onChange={(e) => update((s) => ({
                ...s,
                consent: e.target.checked
                  ? s.consent ? { ...s.consent, enabled: true } : { enabled: true, heading: "Vaccination consent", relationshipOptions: ["Owner", "Co-owner", "Authorized agent of the owner"], agreeLabel: "I have read and understand the above consent statement.", esignLabel: "I agree to sign this form electronically." }
                  : s.consent ? { ...s.consent, enabled: false } : undefined,
              }))} />
              Consent & electronic signature
            </label>
            {schema.consent?.enabled && (
              <div className="mt-3 space-y-3">
                <label className="block"><span className="text-sm font-medium">Heading</span><input className={cls} value={schema.consent.heading ?? ""} onChange={(e) => update((s) => ({ ...s, consent: { ...s.consent!, heading: e.target.value } }))} /></label>
                <label className="block"><span className="text-sm font-medium">Consent wording (shown exactly as typed and stored with every signature)</span>
                  <textarea rows={6} className={cls} value={consentText} onChange={(e) => { setConsentText(e.target.value); setDirty(true); }} /></label>
                <label className="block"><span className="text-sm font-medium">Agreement checkbox</span><input className={cls} value={schema.consent.agreeLabel} onChange={(e) => update((s) => ({ ...s, consent: { ...s.consent!, agreeLabel: e.target.value } }))} /></label>
                <label className="block"><span className="text-sm font-medium">E-signature checkbox</span><textarea rows={2} className={cls} value={schema.consent.esignLabel} onChange={(e) => update((s) => ({ ...s, consent: { ...s.consent!, esignLabel: e.target.value } }))} /></label>
                <label className="block"><span className="text-sm font-medium">Who may sign (one per line)</span>
                  <textarea rows={3} className={cls} value={schema.consent.relationshipOptions.join("\n")} onChange={(e) => update((s) => ({ ...s, consent: { ...s.consent!, relationshipOptions: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } }))} /></label>
                <p className="text-xs text-amber-800">Have consent wording reviewed for New York veterinary requirements before publishing changes.</p>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
            <label className="block"><span className="text-sm font-medium">Submit button text</span><input className={cls} value={schema.submitLabel ?? ""} onChange={(e) => update((s) => ({ ...s, submitLabel: e.target.value || undefined }))} /></label>
            <label className="block"><span className="text-sm font-medium">What changed? (for the version history)</span><input className={cls} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="e.g. Added Lyme to vaccine list" /></label>
            <label className="block sm:col-span-2"><span className="text-sm font-medium">Thank-you message</span><textarea rows={2} className={cls} value={schema.confirmationMessage ?? ""} onChange={(e) => update((s) => ({ ...s, confirmationMessage: e.target.value || undefined }))} /></label>
          </section>
        </div>
      )}
    </div>
  );
}
