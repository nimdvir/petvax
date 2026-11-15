import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { NavLinks } from "@/components/nav-links";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  const links = [
    { href: "/", label: "Today" },
    { href: "/appointments", label: "Appointments" },
    { href: "/certificates", label: "Certificates" },
    { href: "/clients", label: "Clients" },
    { href: "/submissions", label: "Submissions" },
    { href: "/reminders", label: "Due soon" },
    { href: "/forms", label: "Forms" },
    { href: "/settings", label: "Settings" },
  ];
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="" className="h-8 w-auto rounded" />
            <span>PetVax Office</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-600 sm:inline">{profile.full_name} · {profile.role}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100">Sign out</button>
            </form>
          </div>
        </div>
        <NavLinks links={links} />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
