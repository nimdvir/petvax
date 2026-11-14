import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const error = sp.error === "not_staff" ? "This account does not have PetVax Office access. Ask an administrator to add you." : sp.error;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="PetVax" className="mx-auto h-14 w-auto rounded" />
          <h1 className="mt-3 text-xl font-bold">PetVax Office</h1>
          <p className="text-sm text-gray-600">Staff sign in</p>
        </div>
        <LoginForm next={next} initialError={error ?? null} />
      </div>
    </main>
  );
}
