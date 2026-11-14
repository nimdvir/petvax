/** Re-upload files saved by storage-backup.ts, verifying each SHA-256.  tsx scripts/storage-restore.ts <dir> */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { serviceClient } from "./_env";

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Usage: storage-restore.ts <dir>");
  const { db } = serviceClient();
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as { bucket: string; path: string; sha256: string; contentType: string }[];
  let ok = 0;
  for (const m of manifest) {
    const bytes = readFileSync(path.join(dir, m.bucket, m.path));
    if (createHash("sha256").update(bytes).digest("hex") !== m.sha256) throw new Error(`Checksum mismatch in backup: ${m.bucket}/${m.path}`);
    const r = await db.storage.from(m.bucket).upload(m.path, bytes, { contentType: m.contentType, upsert: true });
    if (r.error) throw new Error(`${m.bucket}/${m.path}: ${r.error.message}`);
    ok++;
  }
  console.log(`✓ ${ok} files restored`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
