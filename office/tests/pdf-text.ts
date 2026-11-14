import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Extract text from a PDF with poppler's pdftotext (layout mode). */
export function pdfToText(pdf: Uint8Array): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pvx-pdf-"));
  const file = path.join(dir, "c.pdf");
  writeFileSync(file, pdf);
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
}
