/** Download every file in the Office's private buckets, with a SHA-256 manifest.  tsx scripts/storage-backup.ts <dir> */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serviceClient } from "./_env";

const BUCKETS = ["consent-signatures", "certificates", "documents", "staff-signatures"];

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: storage-backup.ts <dir>");
  const { db } = serviceClient();
  const manifest: { bucket: string; path: string; sha256: string; size: number; contentType: string }[] = [];
  for (const bucket of BUCKETS) {
    const walk = async (prefix: string) => {
      for (let offset = 0; ; offset += 1000) {
        const r = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
        if (r.error) throw new Error(`${bucket}/${prefix}: ${r.error.message}`);
        for (const item of r.data) {
          const p = prefix ? `${prefix}/${item.name}` : item.name;
          if (!item.id) { await walk(p); continue; } // folder
          const f = await db.storage.from(bucket).download(p);
          if (f.error || !f.data) throw new Error(`download ${bucket}/${p}: ${f.error?.message}`);
          const bytes = Buffer.from(await f.data.arrayBuffer());
          const file = path.join(out, bucket, p);
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, bytes);
          manifest.push({ bucket, path: p, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, contentType: (item.metadata as { mimetype?: string } | null)?.mimetype ?? "application/octet-stream" });
        }
        if (r.data.length < 1000) break;
      }
    };
    await walk("");
  }
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`✓ ${manifest.length} files backed up to ${out}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
