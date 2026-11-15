import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { AnswerGroup, FormSchema } from "@/lib/forms/schema";
import { isVisible } from "@/lib/forms/schema";
import { hexToRgb, makeSafe, wrap } from "@/lib/certificates/pdf";
import { formatNyDateTime } from "@/lib/time";

export interface SubmissionPdfConsent {
  petName: string;
  signerName: string;
  relationship: string;
  signedAt: string;
  consentText: string;
  consentSha256: string;
  recordHash: string;
  signatureSha256: string | null;
  signature?: { bytes: Uint8Array; type: "png" | "jpg" } | null;
}

export interface SubmissionPdfInput {
  submissionId: string;
  formTitle: string;
  formVersion: number | null;
  submittedAt: string;
  status: string;
  source: string;
  externalId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  business: { name: string; accent_color: string };
  schema: FormSchema | null;
  answers: Record<string, unknown>;
  consents: SubmissionPdfConsent[];
  logo?: { bytes: Uint8Array; type: "png" | "jpg" } | null;
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 44;
const INK = rgb(0.13, 0.15, 0.17);
const MUTED = rgb(0.38, 0.42, 0.46);
const RULE = rgb(0.82, 0.85, 0.87);

const show = (v: unknown): string =>
  Array.isArray(v) ? v.join(", ") : v === true || v === "yes" ? "Yes" : v === false || v === "no" ? "No" : v === null || v === undefined ? "" : String(v);

/** Rows of [label, answer] in form order; repeating sections become titled groups (one per pet). */
function answerBlocks(schema: FormSchema | null, answers: Record<string, unknown>): { title: string; rows: [string, string][] }[] {
  if (!schema) {
    const rows = Object.entries(answers).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : show(v)] as [string, string]);
    return [{ title: "Answers", rows }];
  }
  const blocks: { title: string; rows: [string, string][] }[] = [];
  for (const s of schema.sections) {
    if (s.repeat) {
      const groups = (answers[s.id] as AnswerGroup[] | undefined) ?? [];
      groups.forEach((g, i) => {
        const name = (g.pet_name as string) || "";
        blocks.push({
          title: `${s.repeat!.itemLabel} ${i + 1}${name ? `: ${name}` : ""}`,
          rows: s.fields.filter((f) => f.type !== "info" && isVisible(f, g) && show(g[f.id]) !== "").map((f) => [f.label, show(g[f.id])]),
        });
      });
    } else {
      const rows = s.fields.filter((f) => f.type !== "info" && f.id in answers && show(answers[f.id]) !== "")
        .map((f) => [f.label, show(answers[f.id])] as [string, string]);
      if (rows.length) blocks.push({ title: s.title, rows });
    }
  }
  return blocks;
}

/** A complete, human-readable record of one form submission (answers, consent wording, signature, evidence). */
export async function renderSubmissionPdf(input: SubmissionPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.business.name} form submission ${input.submissionId}`);
  doc.setAuthor(input.business.name);
  doc.setCreator("PetVax Office");
  doc.setCreationDate(new Date(input.submittedAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafe(regular);
  const accent = hexToRgb(input.business.accent_color || "#b91c1c");
  let logo: PDFImage | null = null;
  if (input.logo) logo = input.logo.type === "png" ? await doc.embedPng(input.logo.bytes) : await doc.embedJpg(input.logo.bytes);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, yy: number, size = 9.5, font: PDFFont = regular, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font, color });
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: accent });
    let x = M;
    if (logo) {
      const h = 30;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x, y: PAGE_H - 46, width: w, height: h });
      x += w + 10;
    }
    text(`${input.business.name} — Form submission`, x, PAGE_H - 34, 12, bold, accent);
    y = PAGE_H - 70;
  };
  const ensure = (h: number) => { if (y - h < 60) newPage(); };

  newPage();
  text(input.formTitle + (input.formVersion ? ` (version ${input.formVersion})` : ""), M, y, 16, bold);
  y -= 18;
  const meta = [
    `Received ${formatNyDateTime(input.submittedAt)} (New York time)`,
    `Submission ID ${input.submissionId}`,
    input.source === "jotform" ? `Imported from Jotform submission ${input.externalId}` : null,
    `Status when saved: ${input.status.replace(/_/g, " ")}`,
  ].filter(Boolean) as string[];
  for (const m of meta) { text(m, M, y, 8.5, regular, MUTED); y -= 11; }
  y -= 8;

  for (const block of answerBlocks(input.schema, input.answers)) {
    ensure(40);
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PAGE_W - M, y: y + 4 }, thickness: 0.6, color: RULE });
    y -= 10;
    text(block.title, M, y, 11, bold, accent);
    y -= 16;
    for (const [label, value] of block.rows) {
      const labelLines = wrap(safe(label), bold, 8.5, 190);
      const valueLines = wrap(safe(value), regular, 9.5, PAGE_W - 2 * M - 205);
      const h = Math.max(labelLines.length * 10.5, valueLines.length * 12) + 4;
      ensure(h);
      labelLines.forEach((l, i) => text(l, M, y - i * 10.5, 8.5, bold, MUTED));
      valueLines.forEach((l, i) => text(l, M + 205, y - i * 12, 9.5));
      y -= h;
    }
    y -= 6;
  }

  for (const c of input.consents) {
    ensure(170);
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PAGE_W - M, y: y + 4 }, thickness: 0.6, color: RULE });
    y -= 10;
    text(`Signed consent — ${c.petName}`, M, y, 11, bold, accent);
    y -= 15;
    for (const l of wrap(safe(c.consentText), regular, 9, PAGE_W - 2 * M)) { ensure(12); text(l, M, y, 9); y -= 11.5; }
    y -= 6;
    if (c.signature) {
      const img = c.signature.type === "png" ? await doc.embedPng(c.signature.bytes) : await doc.embedJpg(c.signature.bytes);
      const scale = Math.min(50 / img.height, 220 / img.width);
      ensure(img.height * scale + 10);
      page.drawImage(img, { x: M, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
      y -= img.height * scale + 6;
    }
    page.drawLine({ start: { x: M, y }, end: { x: M + 240, y }, thickness: 0.6, color: INK });
    y -= 12;
    text(`${c.signerName} (${c.relationship}) — signed ${formatNyDateTime(c.signedAt)}`, M, y, 9, bold);
    y -= 12;
    for (const l of [`Consent text SHA-256: ${c.consentSha256}`, `Signature SHA-256: ${c.signatureSha256 ?? "none"}`, `Record hash: ${c.recordHash}`]) {
      text(l, M, y, 7, regular, MUTED);
      y -= 9;
    }
    y -= 8;
  }

  if (input.ipAddress || input.userAgent) {
    ensure(30);
    text(`Submitted from IP ${input.ipAddress ?? "unknown"}`, M, y, 7, regular, MUTED);
    y -= 9;
    for (const l of wrap(safe(`Device: ${input.userAgent ?? "unknown"}`), regular, 7, PAGE_W - 2 * M)) { text(l, M, y, 7, regular, MUTED); y -= 9; }
  }

  pages.forEach((p, i) => p.drawText(safe(`Submission ${input.submissionId}  |  Page ${i + 1} of ${pages.length}`), { x: M, y: 30, size: 7.5, font: regular, color: MUTED }));
  return doc.save();
}
