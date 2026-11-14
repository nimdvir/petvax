import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const variants = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 border-transparent",
  secondary: "bg-white text-gray-800 hover:bg-gray-50 border-gray-300",
  danger: "bg-white text-red-700 hover:bg-red-50 border-red-300",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100 border-transparent",
};
const btnBase = "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return <button className={cx(btnBase, variants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link className={cx(btnBase, variants[variant], className)} {...props} />;
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-gray-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && <Link href={back.href} className="text-sm text-gray-600 hover:text-brand-700">← {back.label}</Link>}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const fieldBase = "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-brand-700 focus:ring-1 focus:ring-brand-700 focus:outline-none";

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="text-sm font-medium text-gray-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-700" role="alert">{error}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-[88px]", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, className)} {...props} />;
}

const badgeColors: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700", green: "bg-green-100 text-green-800", yellow: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800",
};
export function Badge({ color = "gray", children }: { color?: keyof typeof badgeColors; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeColors[color])}>{children}</span>;
}

export const statusColor = (s: string): keyof typeof badgeColors =>
  ({ requested: "yellow", confirmed: "blue", completed: "green", canceled: "gray", processed: "green", needs_review: "yellow",
     error: "red", received: "gray", draft: "yellow", final: "green", amended: "blue", issued: "green", voided: "red",
     active: "green", superseded: "gray", published: "green", retired: "gray", ok: "green" } as Record<string, keyof typeof badgeColors>)[s] ?? "gray";

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={statusColor(status)}>{status.replace(/_/g, " ")}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{children}</p>;
}

export function Flash({ params }: { params: Record<string, string | string[] | undefined> }) {
  const ok = typeof params.ok === "string" ? params.ok : null;
  const error = typeof params.error === "string" ? params.error : null;
  if (!ok && !error) return null;
  return (
    <div role="status" className={cx("mb-4 rounded-lg border px-4 py-3 text-sm", error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800")}>
      {error ?? ok}
    </div>
  );
}

export function DL({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{k}</dt>
          <dd className="break-words text-sm text-gray-900">{v === null || v === undefined || v === "" ? <span className="text-gray-400">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={cx("px-3 py-2 align-top", className)}>{children}</td>;
