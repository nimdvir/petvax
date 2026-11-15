"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { ProductOption } from "@/components/vaccine-form";

const ROUTES = ["SC", "IM", "Intranasal", "Oral", "Transdermal"];
const SITES = ["Right forelimb", "Left forelimb", "Right hindlimb", "Left hindlimb", "Interscapular", "Intranasal", "Oral"];
const cls = "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700";

function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

type Row = Record<string, string>;

function startRow(p: ProductOption): Row {
  return {
    manufacturer: p.last?.manufacturer ?? p.manufacturer ?? "",
    lot_number: p.last?.lot_number ?? "",
    serial_number: p.last?.serial_number ?? "",
    lot_expiration: p.last?.lot_expiration ?? "",
    route: p.last?.route ?? p.default_route ?? "",
    site: p.last?.site ?? p.default_site ?? "",
    duration_months: p.default_interval_months ? String(p.default_interval_months) : "",
    next_due_on: "",
    rabies_tag_number: "",
  };
}

/**
 * One screen for the whole certificate: tick the vaccines given today, check the pre-filled
 * lot details against the vials, press one button. The last lot used for each vaccine is
 * filled in automatically, and the next due date follows the date given and duration.
 */
export function QuickCertificateForm({ products, today, preselected, canSign }: {
  products: ProductOption[]; today: string; preselected: string[]; canSign: boolean;
}) {
  const [given, setGiven] = useState(today);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(products.filter((p) => preselected.includes(p.id)).map((p) => [p.id, startRow(p)])));
  const toggle = (p: ProductOption, on: boolean) => setRows((r) => {
    const next = { ...r };
    if (on) next[p.id] = startRow(p); else delete next[p.id];
    return next;
  });
  const set = (id: string, k: string, val: string) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: val } }));
  const chosen = products.filter((p) => rows[p.id]);
  const { pending } = useFormStatus();

  return (
    <div className="space-y-5">
      <label className="block max-w-xs"><span className="text-sm font-medium">Date given *</span>
        <input type="date" name="administered_on" className={cls} value={given} max={today} onChange={(e) => setGiven(e.target.value)} required /></label>

      <fieldset>
        <legend className="text-sm font-medium">Vaccines given *</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {products.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 ${rows[p.id] ? "border-brand-700 bg-brand-50" : "border-gray-300 bg-white"}`}>
              <input type="checkbox" name="vaccine" value={p.id} className="h-5 w-5" checked={!!rows[p.id]} onChange={(e) => toggle(p, e.target.checked)} />
              <span className="font-medium">{p.name}</span>
              {preselected.includes(p.id) && <span className="ml-auto text-xs text-brand-700">requested</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {chosen.map((p) => {
        const r = rows[p.id];
        const due = r.next_due_on || (given && r.duration_months ? addMonths(given, Number(r.duration_months)) : "");
        const f = (k: string) => `${p.id}.${k}`;
        const expired = r.lot_expiration && given && r.lot_expiration < given;
        const input = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
          <label className="block"><span className="text-sm font-medium">{label}</span>
            <input name={f(k)} className={cls} value={r[k] ?? ""} onChange={(e) => set(p.id, k, e.target.value)} {...props} /></label>
        );
        return (
          <section key={p.id} className="rounded-xl border border-gray-200 bg-white p-4" aria-label={p.name}>
            <h3 className="mb-3 font-semibold">{p.name}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {input("manufacturer", "Manufacturer *", { required: true })}
              {input("lot_number", p.is_rabies ? "Lot number" : "Lot number *", { required: !p.is_rabies })}
              {p.is_rabies && input("serial_number", "Serial number")}
              {input("lot_expiration", "Vial expiration", { type: "date" })}
              <label className="block"><span className="text-sm font-medium">Route</span>
                <select name={f("route")} className={cls} value={r.route} onChange={(e) => set(p.id, "route", e.target.value)}><option value="">—</option>{ROUTES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="block"><span className="text-sm font-medium">Site</span>
                <select name={f("site")} className={cls} value={r.site} onChange={(e) => set(p.id, "site", e.target.value)}><option value="">—</option>{SITES.map((x) => <option key={x}>{x}</option>)}</select></label>
              {p.is_rabies ? (
                <label className="block"><span className="text-sm font-medium">Duration *</span>
                  <select name={f("duration_months")} className={cls} value={r.duration_months} required onChange={(e) => set(p.id, "duration_months", e.target.value)}>
                    <option value="">Choose…</option><option value="12">1 year</option><option value="36">3 years</option>
                  </select></label>
              ) : (
                <label className="block"><span className="text-sm font-medium">Good for (months)</span>
                  <input name={f("duration_months")} inputMode="numeric" className={cls} value={r.duration_months} onChange={(e) => set(p.id, "duration_months", e.target.value)} /></label>
              )}
              <label className="block"><span className="text-sm font-medium">Next due</span>
                <input type="date" name={f("next_due_on")} className={cls} value={due} onChange={(e) => set(p.id, "next_due_on", e.target.value)} /></label>
              {p.is_rabies && input("rabies_tag_number", "Rabies tag no.")}
            </div>
            {p.is_rabies && <p className="mt-2 text-xs text-gray-500">Rabies needs a lot or serial number.</p>}
            {p.last?.lot_number && <p className="mt-2 text-xs text-gray-500">Filled in from the last {p.name} lot you used. Check it matches the vial.</p>}
            {expired && <p className="mt-2 text-sm font-semibold text-red-700" role="alert">⚠ This vial expired before the date given.</p>}
          </section>
        );
      })}

      <label className="block"><span className="text-sm font-medium">Notes to print on the certificate (optional)</span>
        <textarea name="notes" rows={3} className={cls} placeholder="e.g. Healthy exam. T 101.5 °F, HR 140, RR 28. Next DHPP booster in 3 weeks." /></label>

      <button type="submit" disabled={!canSign || chosen.length === 0 || pending}
        className="w-full rounded-lg bg-brand-700 px-4 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
        {pending ? "Creating certificate…" : <>Sign &amp; create certificate{chosen.length ? ` (${chosen.length} vaccine${chosen.length === 1 ? "" : "s"})` : ""}</>}
      </button>
    </div>
  );
}
