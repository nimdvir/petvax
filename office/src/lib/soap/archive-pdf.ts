import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { makeSafe, wrap } from "@/lib/certificates/pdf";
import { formatDate, formatNyDateTime } from "@/lib/time";

export interface SoapArchiveInput {
  clinic: string;
  pet: string;
  species: string;
  owner: string;
  clinician: string;
  visitDate: string;
  savedAt: string;
  revision: number;
  status: "final" | "amended";
  note: Record<string, unknown>;
}

const show = (value: unknown) =>
  value == null || value === "" ? "Not recorded" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);

/** Render an immutable revision snapshot, not a mutable current note. */
export async function renderSoapArchivePdf(input: SoapArchiveInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${input.clinic} SOAP note — ${input.pet} — revision ${input.revision}`);
  doc.setAuthor(input.clinic);
  doc.setCreator("PetVax Office");
  doc.setCreationDate(new Date(input.savedAt));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafe(font);
  const dark = rgb(.13, .16, .19);
  const muted = rgb(.35, .39, .43);
  const accent = rgb(.65, .11, .15);
  const width = 612, height = 792, margin = 44;
  let page = doc.addPage([width, height]);
  let y = height - margin;
  let pageNo = 1;
  const write = (value: string, x: number, size = 9, f: PDFFont = font, color = dark) => {
    page.drawText(safe(value), { x, y, size, font: f, color });
  };
  const next = () => {
    page = doc.addPage([width,height]); y = height-margin; pageNo++;
    write(`${input.clinic} · SOAP note (continued)`,margin,9,bold,accent); y-=24;
  };
  const needs = (points: number) => { if (y - points < margin + 26) next(); };
  const line = (text: string, boldLabel = false) => {
    const f = boldLabel ? bold : font;
    const lines = wrap(safe(text), f, boldLabel ? 10 : 9, width - margin * 2);
    for (const part of lines) { needs(13); write(part, margin, boldLabel ? 10 : 9, f, boldLabel ? accent : dark); y -= boldLabel ? 15 : 12; }
  };
  line(`${input.clinic} — Pre-vaccination SOAP note`, true);
  line(`Pet: ${input.pet} (${input.species})   Owner: ${input.owner}`);
  line(`Visit: ${formatDate(input.visitDate)}   Clinician: ${input.clinician}`);
  line(`Status: ${input.status.toUpperCase()}   Revision: ${input.revision}   Saved: ${formatNyDateTime(input.savedAt)}`);
  y -= 12;
  const section = (name: string, details: [string, unknown][]) => {
    needs(50); line(name,true);
    for(const [key, value] of details) {
      line(`${key}: ${show(value)}`);
    }
    y -= 8;
  };
  const note=input.note;
  section("S — SUBJECTIVE", [["History and owner concerns",note.subjective]]);
  section("O — OBJECTIVE", [
    ["Temperature",note.temperature == null ? null : `${note.temperature} ${show(note.temperature_unit)}`],
    ["Heart rate",note.heart_rate_bpm == null ? null : `${note.heart_rate_bpm} bpm`],
    ["Respiratory rate",note.respiratory_rate_bpm == null ? null : `${note.respiratory_rate_bpm} breaths/min`],
    ["Weight",note.weight == null ? null : `${note.weight} ${show(note.weight_unit)}`],
    ["Body condition",note.body_condition_score == null ? null : `${note.body_condition_score} / ${show(note.body_condition_scale)}`],
    ["General appearance",note.general_appearance],["Exam findings",note.exam_findings],["Other findings",note.objective_notes],
  ]);
  section("A — ASSESSMENT", [
    ["Assessment",note.assessment],["Fit for vaccination",note.fit_for_vaccination],
  ]);
  section("P — PLAN", [
    ["Plan",note.plan],["Observed reactions",note.observed_reactions],["Follow-up",note.follow_up],
  ]);
  if(input.status==="amended")section("AMENDMENT",[["Reason",note.amendment_reason]]);
  const total=doc.getPageCount();
  doc.getPages().forEach((p,i)=>p.drawText(safe(`PetVax Office · SOAP revision ${input.revision} · Page ${i+1} of ${total}`),
    {x:margin,y:24,font,size:8,color:muted}));
  return doc.save();
}
