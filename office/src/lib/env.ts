export function getPublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public environment variables are missing");
  return { url, key };
}
export function getSecretEnv() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Server-only Supabase secret key is not configured");
  return { ...getPublicEnv(), secret };
}
