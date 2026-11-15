"use client";
import { useState } from "react";

export interface ProductOption {
  id: string; name: string; manufacturer: string | null; default_route: string | null; default_site: string | null;
  default_interval_months: number | null; is_rabies: boolean; vaccine_type?: string;
  last?: { manufacturer: string | null; lot_number: string | null; serial_number: string | null; lot_expiration: string | null; route: string | null; site: string | null } | null;
}

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

/** Vaccine entry. Picking a product pre-fills the last lot used and the next due date to save typing. */
export function VaccineFields({ products, today, defaults, staff, defaultGivenBy }: {
  products: ProductOption[]; today: string; defaults?: Record<string, unknown>;
  staff?: { user_id: string; full_name: string }[]; defaultGivenBy?: string | null;
}) {
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { administered_on: today };
    for (const [k, val] of Object.entries(defaults ?? {})) o[k] = val === null || val === undefined || typeof val === "object" ? "" : String(val);
    return o;
  });
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));
  const product = products.find((p) => p.id === v.product_id);

  function pick(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return set("product_id", id);
    const duration = p.default_interval_months ? String(p.default_interval_months) : "";
    setV((prev) => ({
      ...prev, product_id: id,
      manufacturer: p.last?.manufacturer ?? p.manufacturer ?? "",
      lot_number: p.last?.lot_number ?? "",
      serial_number: p.last?.serial_number ?? "",
      lot_expiration: p.last?.lot_expiration ?? "",
      route: p.last?.route ?? p.default_route ?? "",
      site: p.last?.site ?? p.default_site ?? "",
      duration_months: duration,
      next_due_on: duration && prev.administered_on ? addMonths(prev.administered_on, Number(duration)) : "",
    }));
  }
  const recompute = (given: string, duration: string) =>
    setV((p) => ({ ...p, administered_on: given, duration_months: duration, next_due_on: given && duration ? addMonths(given, Number(duration)) : p.next_due_on }));
  const expired = v.lot_expiration && v.administered_on && v.lot_expiration < v.administered_on;

  const input = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block"><span className="text-sm font-medium">{label}</span>
      <input name={name} className={cls} value={v[name] ?? ""} onChange={(e) => set(name, e.target.value)} {...props} /></label>
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="block sm:col-span-2"><span className="text-sm font-medium">Vaccine *</span>
        <select name="product_id" className={cls} value={v.product_id ?? ""} onChange={(e) => pick(e.target.value)} required>
          <option value="">Choose…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block"><span className="text-sm font-medium">Date given *</span>
        <input type="date" name="administered_on" className={cls} value={v.administered_on ?? ""} onChange={(e) => recompute(e.target.value, v.duration_months ?? "")} required /></label>
      {input("manufacturer", "Manufacturer *")}
      {input("lot_number", "Lot number *")}
      {input("lot_expiration", "Product expiration", { type: "date" })}
      {product?.is_rabies && input("serial_number", "Serial number")}
      <label className="block"><span className="text-sm font-medium">Route</span>
        <select name="route" className={cls} value={v.route ?? ""} onChange={(e) => set("route", e.target.value)}><option value="">—</option>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></label>
      <label className="block"><span className="text-sm font-medium">Site</span>
        <select name="site" className={cls} value={v.site ?? ""} onChange={(e) => set("site", e.target.value)}><option value="">—</option>{SITES.map((r) => <option key={r}>{r}</option>)}</select></label>
      <label className="block"><span className="text-sm font-medium">Duration (months)</span>
        <input name="duration_months" inputMode="numeric" className={cls} value={v.duration_months ?? ""} onChange={(e) => recompute(v.administered_on ?? "", e.target.value)} /></label>
      {input("next_due_on", "Next due", { type: "date" })}
      {product?.is_rabies && input("rabies_tag_number", "Rabies tag number")}
      {staff && (
        <label className="block"><span className="text-sm font-medium">Given by</span>
          <select name="administered_by" className={cls} defaultValue={defaultGivenBy ?? ""}>{staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}</select></label>
      )}
      <label className="block sm:col-span-3"><span className="text-sm font-medium">Adverse reaction observed</span>
        <input name="adverse_reaction" className={cls} value={v.adverse_reaction ?? ""} onChange={(e) => set("adverse_reaction", e.target.value)} placeholder="Leave blank if none" /></label>
      {expired && <p className="text-sm font-semibold text-red-700 sm:col-span-3" role="alert">⚠ This lot expired before the date given. Check the vial.</p>}
      {product?.last?.lot_number && <p className="text-xs text-gray-500 sm:col-span-3">Pre-filled from the last {product.name} lot you recorded. Check it matches the vial.</p>}
    </div>
  );
}
