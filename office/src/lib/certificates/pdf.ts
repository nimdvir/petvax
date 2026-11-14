import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import type { CertificateSnapshot } from "./data";
import { formatDate } from "@/lib/time";

export interface RenderAssets {
  logo?: { bytes: Uint8Array; type: "png" | "jpg" } | null;
  signature?: { bytes: Uint8Array; type: "png" | "jpg" } | null;
}

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const M = 44; // margin

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const INK = rgb(0.13, 0.15, 0.17);
const MUTED = rgb(0.38, 0.42, 0.46);
const RULE = rgb(0.82, 0.85, 0.87);
const SHADE = rgb(0.955, 0.965, 0.97);

const TRANSLIT: Record<string, string> = { "Ł": "L", "ł": "l", "Ø": "O", "ø": "o", "ß": "ss", "Đ": "D", "đ": "d", "ı": "i", "Ħ": "H", "ħ": "h" };
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Standard PDF fonts only cover WinAnsi; replace anything they can't draw instead of failing. */
function makeSafe(font: PDFFont) {
  const cache = new Map<string, boolean>();
  return (text: string | null | undefined): string => {
    if (!text) return "";
    const normalized = text
      .replace(/./gu, (c) => TRANSLIT[c] ?? c)
      .normalize("NFKD").replace(COMBINING_MARKS, "").replace(/[\r\t]/g, " ");
    let out = "";
    for (const ch of normalized) {
      if (ch === "\n") { out += ch; continue; }
      if (!cache.has(ch)) {
        try { font.encodeText(ch); cache.set(ch, true); } catch { cache.set(ch, false); }
      }
      out += cache.get(ch) ? ch : "?";
    }
    return out;
  };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      // Hard-break words longer than the column.
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    lines.push(line);
  }
  return lines;
}

const nr = "Not recorded";

/** Render the certificate PDF purely from the saved snapshot. */
export async function renderCertificatePdf(snap: CertificateSnapshot, assets: RenderAssets = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${snap.business.name} Vaccination Certificate ${snap.certificate_number}`);
  doc.setAuthor(snap.business.name);
  doc.setSubject(`Vaccination certificate for ${snap.pet.name}`);
  doc.setCreator("PetVax Office");
  doc.setProducer("PetVax Office");
  doc.setCreationDate(new Date(snap.issued_at));
  doc.setKeywords([snap.certificate_number, snap.verification_code]);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafe(regular);
  const accent = hexToRgb(snap.business.accent_color || "#b91c1c");

  let logo: PDFImage | null = null;
  if (assets.logo) logo = assets.logo.type === "png" ? await doc.embedPng(assets.logo.bytes) : await doc.embedJpg(assets.logo.bytes);
  let sigImg: PDFImage | null = null;
  if (assets.signature) sigImg = assets.signature.type === "png" ? await doc.embedPng(assets.signature.bytes) : await doc.embedJpg(assets.signature.bytes);
  const qrPng = await QRCode.toBuffer(snap.verify_url, { type: "png", margin: 1, width: 240, errorCorrectionLevel: "M" });
  const qr = await doc.embedPng(qrPng);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const text = (s: string, x: number, yy: number, size = 10, font = regular, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font, color });

  const header = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: accent });
    let x = M;
    const top = PAGE_H - 30;
    if (logo) {
      const h = 46;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x, y: top - h + 4, width: w, height: h });
      x += w + 14;
    }
    text(snap.business.name, x, top - 16, 18, bold, accent);
    if (snap.business.tagline) text(snap.business.tagline, x, top - 31, 9, regular, MUTED);
    const contact = [snap.business.phone, snap.business.email, snap.business.website, snap.business.address].filter(Boolean) as string[];
    contact.forEach((c, i) => {
      const s = safe(c);
      page.drawText(s, { x: PAGE_W - M - regular.widthOfTextAtSize(s, 8.5), y: top - 8 - i * 11, size: 8.5, font: regular, color: MUTED });
    });
    y = top - 62;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: RULE });
    y -= 30;
  };

  const ensure = (needed: number): boolean => {
    if (y - needed >= 120) return false;
    header();
    text(`Certificate ${snap.certificate_number} (continued)`, M, y, 10, bold, MUTED);
    y -= 22;
    return true;
  };

  // ---------------------------------------------------------------- page 1
  header();
  text("Vaccination Certificate", M, y, 22, bold);
  const numLabel = `Certificate No. ${snap.certificate_number}`;
  page.drawText(safe(numLabel), { x: PAGE_W - M - bold.widthOfTextAtSize(numLabel, 10.5), y: y + 8, size: 10.5, font: bold, color: INK });
  const issued = `Issued ${formatDate(snap.issued_on)}`;
  page.drawText(issued, { x: PAGE_W - M - regular.widthOfTextAtSize(issued, 9.5), y: y - 6, size: 9.5, font: regular, color: MUTED });
  y -= 28;

  // Owner & pet panels
  const colW = (PAGE_W - 2 * M - 16) / 2;
  const panel = (x: number, title: string, rows: [string, string][]) => {
    const lineH = 13;
    const wrapped = rows.map(([k, v]) => [k, wrap(safe(v), regular, 9.5, colW - 80)] as const);
    const h = 26 + wrapped.reduce((sum, [, lines]) => sum + lines.length * lineH, 0) + 6;
    page.drawRectangle({ x, y: y - h, width: colW, height: h, color: SHADE, borderColor: RULE, borderWidth: 0.6 });
    text(title.toUpperCase(), x + 10, y - 16, 8.5, bold, accent);
    let yy = y - 32;
    for (const [k, lines] of wrapped) {
      text(k, x + 10, yy, 8.5, regular, MUTED);
      lines.forEach((l, i) => text(l, x + 66, yy - i * lineH, 9.5, i === 0 && k === "Name" ? bold : regular));
      yy -= lines.length * lineH;
    }
    return h;
  };
  const ownerRows: [string, string][] = [
    ["Name", snap.owner.name],
    ["Address", snap.owner.address ?? nr],
    ["Phone", snap.owner.phone ?? nr],
    ["Email", snap.owner.email ?? nr],
  ];
  const sex = snap.pet.sex + (snap.pet.spayed_neutered == null ? "" : snap.pet.spayed_neutered
    ? (snap.pet.sex === "Female" ? " (spayed)" : snap.pet.sex === "Male" ? " (neutered)" : " (spayed/neutered)") : " (intact)");
  const petRows: [string, string][] = [
    ["Name", snap.pet.name],
    ["Species", snap.pet.species],
    ["Breed", snap.pet.breed ?? nr],
    ["Sex", sex],
    ["Age", snap.pet.age ? `${snap.pet.age}${snap.pet.date_of_birth ? ` (born ${formatDate(snap.pet.date_of_birth)})` : ""}` : nr],
    ["Color", snap.pet.color ?? nr],
    ["Weight", snap.pet.weight_lb ? `${Number(snap.pet.weight_lb)} lb` : nr],
    ["Microchip", snap.pet.microchip ?? "None on file"],
  ];
  const h1 = panel(M, "Owner", ownerRows);
  const h2 = panel(M + colW + 16, "Pet", petRows);
  y -= Math.max(h1, h2) + 26;

  // Vaccine table
  const cols = [
    { title: "Vaccine", w: 112 },
    { title: "Manufacturer", w: 84 },
    { title: "Lot / Serial (exp.)", w: 100 },
    { title: "Date given", w: 62 },
    { title: "Next due", w: 62 },
    { title: "Route / Site", w: PAGE_W - 2 * M - 420 },
  ];
  const tableHeader = () => {
    page.drawRectangle({ x: M, y: y - 6, width: PAGE_W - 2 * M, height: 20, color: accent });
    let x = M + 6;
    for (const c of cols) { text(c.title, x, y, 8.5, bold, rgb(1, 1, 1)); x += c.w; }
    y -= 22;
  };
  text("Vaccinations administered", M, y, 12, bold);
  y -= 22;
  tableHeader();
  snap.vaccinations.forEach((v, idx) => {
    const lot = [v.lot_number, v.serial_number && v.serial_number !== v.lot_number ? `S/N ${v.serial_number}` : null].filter(Boolean).join(" / ");
    const cells = [
      v.vaccine_name + (v.is_rabies && v.duration_months ? `\n${v.duration_months / 12 >= 1 && v.duration_months % 12 === 0 ? `${v.duration_months / 12}-year` : `${v.duration_months}-month`} rabies` : ""),
      v.manufacturer ?? nr,
      (lot || nr) + (v.lot_expiration ? `\nexp. ${formatDate(v.lot_expiration)}` : ""),
      formatDate(v.administered_on),
      v.next_due_on ? formatDate(v.next_due_on) : nr,
      [v.route, v.site].filter(Boolean).join(" / ") || nr,
    ];
    const wrapped = cells.map((c, i) => wrap(safe(c), regular, 8.5, cols[i].w - 10));
    const extra: string[] = [];
    if (v.is_rabies) {
      extra.push(`Rabies tag no.: ${v.rabies_tag_number ?? nr}`);
      extra.push(`Administered by: ${[v.administered_by_name, v.administered_by_credentials].filter(Boolean).join(", ")}${v.administered_by_license ? `, License No. ${v.administered_by_license}` : ""}`);
    }
    const lines = Math.max(...wrapped.map((w) => w.length));
    const rowH = lines * 11 + (extra.length ? extra.length * 11 + 2 : 0) + 8;
    if (ensure(rowH + 10)) tableHeader();
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 10, width: PAGE_W - 2 * M, height: rowH, color: SHADE });
    let x = M + 6;
    wrapped.forEach((ls, i) => {
      ls.forEach((l, j) => text(l, x, y - j * 11, 8.5, i === 0 && j === 0 ? bold : regular));
      x += cols[i].w;
    });
    extra.forEach((e, j) => text(e, M + 6, y - lines * 11 - j * 11 - 1, 8, regular, MUTED));
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 10 }, end: { x: PAGE_W - M, y: y + 10 }, thickness: 0.4, color: RULE });
  });
  y -= 18;

  // Signature block
  ensure(130);
  text("Certified by", M, y, 9, bold, accent);
  y -= 10;
  if (sigImg) {
    const scale = Math.min(44 / sigImg.height, 200 / sigImg.width);
    page.drawImage(sigImg, { x: M, y: y - sigImg.height * scale, width: sigImg.width * scale, height: sigImg.height * scale });
  }
  y -= 50;
  page.drawLine({ start: { x: M, y }, end: { x: M + 250, y }, thickness: 0.8, color: INK });
  y -= 13;
  text(`${snap.signer.name}${snap.signer.credentials ? `, ${snap.signer.credentials}` : ""}`, M, y, 10, bold);
  y -= 12;
  text(`${snap.signer.license_state ?? ""} Veterinary License No. ${snap.signer.license_number}`.trim(), M, y, 9, regular, MUTED);
  y -= 12;
  text(`Electronically signed ${formatDate(snap.issued_on)} by the issuing veterinarian through PetVax Office.`, M, y, 8, regular, MUTED);

  // ---------------------------------------------------------------- footer on every page
  pages.forEach((p, i) => {
    const fy = 40;
    p.drawLine({ start: { x: M, y: fy + 58 }, end: { x: PAGE_W - M, y: fy + 58 }, thickness: 0.6, color: RULE });
    p.drawImage(qr, { x: PAGE_W - M - 52, y: fy - 4, width: 52, height: 52 });
    const footerLines = [
      ...(snap.business.footer ? wrap(safe(snap.business.footer), regular, 7.5, PAGE_W - 2 * M - 70) : []),
      `Verify this certificate: ${snap.verify_url}`,
      `Certificate ${snap.certificate_number}  |  Page ${i + 1} of ${pages.length}`,
    ];
    footerLines.forEach((l, j) => p.drawText(safe(l), { x: M, y: fy + 36 - j * 10, size: 7.5, font: regular, color: MUTED }));
  });

  return doc.save();
}
