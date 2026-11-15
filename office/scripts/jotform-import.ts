/**
 * Import PetVax Jotform submissions into PetVax Office (read-only on the Jotform side).
 *
 *   # preview only (default) — writes nothing:
 *   JOTFORM_API_KEY=... npm run jotform:import
 *   # import for real:
 *   JOTFORM_API_KEY=... npm run jotform:import -- --apply
 *   # from a saved API export instead of the live API:
 *   npm run jotform:import -- --file ./jotform-export.json [--apply]
 *
 * Options: --forms 262500538572052,262500542108042   --since 2026-01-01
 * The report (contains client names — keep it private) is written to ./import-reports/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arg, flag, serviceClient } from "./_env";
import { importJotform, reportToMarkdown, type FetchFile } from "../src/lib/jotform/import";
import { KNOWN_FORMS, type JotformSubmission } from "../src/lib/jotform/map";

const API = process.env.JOTFORM_API_BASE ?? "https://api.jotform.com"; // eu-api.jotform.com / hipaa-api.jotform.com for those accounts

async function fetchSubmissions(apiKey: string, formIds: string[], since?: string): Promise<JotformSubmission[]> {
  const all: JotformSubmission[] = [];
  for (const formId of formIds) {
    for (let offset = 0; ; offset += 1000) {
      const url = new URL(`${API}/form/${formId}/submissions`);
      url.searchParams.set("limit", "1000");
      url.searchParams.set("offset", String(offset));
      if (since) url.searchParams.set("filter", JSON.stringify({ "created_at:gt": `${since} 00:00:00` }));
      const res = await fetch(url, { headers: { APIKEY: apiKey } });
      if (!res.ok) throw new Error(`Jotform API ${res.status} for form ${formId}: ${await res.text()}`);
      const body = (await res.json()) as { content: JotformSubmission[] };
      // Deleted submissions are skipped; everything else (ACTIVE, ARCHIVED, ...) is preserved.
      all.push(...body.content.filter((s) => s.status !== "DELETED"));
      if (body.content.length < 1000) break;
    }
  }
  return all;
}

async function main() {
  const { db } = serviceClient();
  const apply = flag("apply");
  const file = arg("file");
  const apiKey = process.env.JOTFORM_API_KEY ?? "";
  const formIds = (arg("forms") ?? Object.keys(KNOWN_FORMS).join(",")).split(",");
  let submissions: JotformSubmission[];
  if (file) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    submissions = Array.isArray(data) ? data : data.content ?? data.submissions ?? [];
  } else {
    if (!apiKey) throw new Error("Set JOTFORM_API_KEY (a read-only key from Jotform > Settings > API), or pass --file.");
    submissions = await fetchSubmissions(apiKey, formIds, arg("since"));
  }
  const fetchFile: FetchFile = async (url) => {
    try {
      const u = new URL(url);
      const headers: Record<string, string> = {};
      if (apiKey && /(^|\.)jotform\.com$/.test(u.hostname)) headers.APIKEY = apiKey;
      const res = await fetch(u, { headers });
      if (!res.ok) return null;
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  };
  console.log(`${submissions.length} Jotform submissions found. ${apply ? "Importing…" : "Dry run (add --apply to import)."}`);
  const report = await importJotform(db, submissions, { dryRun: !apply, fetchFile, startedBy: "jotform-import cli" });
  mkdirSync("import-reports", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `import-reports/jotform-${apply ? "import" : "dry-run"}-${stamp}`;
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${base}.md`, reportToMarkdown(report));
  console.log(reportToMarkdown(report));
  console.log(`Report saved to ${base}.md`);
  if (report.totals.failed) process.exitCode = 2;
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
