/** Central place for configuration. Server-only values are read lazily so they never reach the browser bundle. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  // On Vercel previews the branch URL is used automatically; set NEXT_PUBLIC_SITE_URL for the real domain.
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000",
};

export function serverEnv() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return {
    secretKey,
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM ?? "PetVax <certificates@petvax.org>",
    emailReplyTo: process.env.EMAIL_REPLY_TO ?? "",
  };
}

export const TIMEZONE = "America/New_York";
