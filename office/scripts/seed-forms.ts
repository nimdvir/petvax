/** Install the default forms (rebuilt from the Jotforms) and print a shareable link for each. Safe to re-run. */
import { serviceClient } from "./_env";
import { DEFAULT_FORMS } from "../src/lib/forms/defaults";
import { hashLinkToken, newLinkToken } from "../src/lib/tokens";

async function main() {
  const { db } = serviceClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  for (const f of DEFAULT_FORMS) {
    let t = (await db.from("form_templates").select("id").eq("slug", f.slug).maybeSingle()).data;
    if (!t) {
      t = (await db.from("form_templates").insert({ slug: f.slug, kind: f.kind, title: f.title, description: f.description }).select("id").single()).data!;
      const v = await db.from("form_versions").insert({
        template_id: t.id, version: 1, status: "published", published_at: new Date().toISOString(),
        schema: f.schema as never, consent_text: f.consentText, change_note: "Rebuilt from Jotform",
      });
      if (v.error) throw new Error(v.error.message);
    }
    const link = (await db.from("form_links").select("share_token").eq("template_id", t.id).not("share_token", "is", null).is("revoked_at", null).limit(1).maybeSingle()).data;
    let token = link?.share_token;
    if (!token) {
      token = newLinkToken();
      await db.from("form_links").insert({ template_id: t.id, token_hash: hashLinkToken(token), share_token: token, label: "Main link" });
    }
    console.log(`${f.title}: ${site}/f/${token}`);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
