/**
 * Print SQL that installs the default forms with a shareable link each (safe to run twice).
 * For applying through the Supabase SQL editor when no secret key is available locally:
 *   npx tsx scripts/forms-seed-sql.ts > forms.sql
 */
import { DEFAULT_FORMS } from "../src/lib/forms/defaults";
import { hashLinkToken, newLinkToken } from "../src/lib/tokens";

const q = (s: string | null) => (s === null ? "null" : `$pvx$${s}$pvx$`);
let sql = "do $do$\ndeclare t uuid;\nbegin\n";
for (const f of DEFAULT_FORMS) {
  const token = newLinkToken();
  sql += `if not exists (select 1 from public.form_templates where slug = ${q(f.slug)}) then
  insert into public.form_templates (slug, kind, title, description)
    values (${q(f.slug)}, ${q(f.kind)}::public.form_kind, ${q(f.title)}, ${q(f.description)}) returning id into t;
  insert into public.form_versions (template_id, version, status, published_at, schema, consent_text, change_note)
    values (t, 1, 'published', now(), ${q(JSON.stringify(f.schema))}::jsonb, ${q(f.consentText)}, 'Rebuilt from Jotform');
  insert into public.form_links (template_id, token_hash, share_token, label)
    values (t, ${q(hashLinkToken(token))}, ${q(token)}, 'Main link');
end if;
`;
}
sql += "end $do$;\n";
process.stdout.write(sql);
