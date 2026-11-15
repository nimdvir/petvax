import { describe, expect, it } from "vitest";
import { loadArchiveScript } from "../support/fake-drive";

const pdf = Buffer.from("%PDF-1.7 test").toString("base64");
const item = (over: Record<string, unknown> = {}) => ({
  secret: "s3cret", folderPath: ["Certificates", "2026", "2026-11"], fileName: "PVX-2026-001001 - Rex - Rivera, Dana - 2026-11-15.pdf",
  mimeType: "application/pdf", base64: pdf, csvHeaders: ["Saved at", "Type", "Details"], csvRow: ["Nov 15", "Vaccine certificate", 'Rabies, "3-year"'], ...over,
});

describe("Google Drive archive script (integrations/google-drive-archive.gs)", () => {
  it("saves the PDF into PetVax Office archive/<type>/<year>/<month> and starts index.csv", () => {
    const g = loadArchiveScript();
    const r = g.doPost(item());
    expect(r.ok).toBe(true);
    const folder = g.find(["PetVax Office archive", "Certificates", "2026", "2026-11"])!;
    expect(folder.files.map((f) => f.name)).toEqual(["PVX-2026-001001 - Rex - Rivera, Dana - 2026-11-15.pdf"]);
    expect(folder.files[0].content.toString()).toBe("%PDF-1.7 test");
    const csv = g.find(["PetVax Office archive"])!.files.find((f) => f.name === "index.csv")!.content.toString();
    expect(csv.split("\r\n")[0]).toBe("Saved at,Type,Details,Drive file");
    expect(csv.split("\r\n")[1]).toBe(`Nov 15,Vaccine certificate,"Rabies, ""3-year""",${r.url}`);
  });

  it("appends one CSV line per new file and never duplicates a file", () => {
    const g = loadArchiveScript();
    g.doPost(item());
    const again = g.doPost(item());
    expect(again).toMatchObject({ ok: true, duplicate: true });
    g.doPost(item({ folderPath: ["Form submissions", "2026", "2026-11"], fileName: "2026-11-15 0930 - Rivera, Dana - Rex - Form.pdf", csvRow: ["Nov 15", "Form submission", "x"] }));
    const csv = g.find(["PetVax Office archive"])!.files.find((f) => f.name === "index.csv")!.content.toString().trim().split("\r\n");
    expect(csv).toHaveLength(3); // header + 2 files
    expect(g.find(["PetVax Office archive", "Form submissions", "2026", "2026-11"])!.files).toHaveLength(1);
  });

  it("rejects requests without the shared secret", () => {
    const g = loadArchiveScript();
    expect(g.doPost(item({ secret: "wrong" }))).toEqual({ ok: false, error: "Not authorized" });
    expect(g.root.folders).toHaveLength(0);
  });
});
