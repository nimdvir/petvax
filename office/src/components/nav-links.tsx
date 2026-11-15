"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="mx-auto max-w-6xl overflow-x-auto px-2">
      <ul className="flex gap-1 whitespace-nowrap">
        {links.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2.5 text-sm font-medium ${active ? "border-brand-700 text-brand-700" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
