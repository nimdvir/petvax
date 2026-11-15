import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

/** Runs integrations/google-drive-archive.gs against an in-memory imitation of Google Drive. */
export interface FakeFile { name: string; content: Buffer; mime: string; url: string }
export interface FakeFolder { name: string; folders: FakeFolder[]; files: FakeFile[] }

export function loadArchiveScript(secret = "s3cret") {
  const root: FakeFolder = { name: "PetVax", folders: [], files: [] };
  let n = 0;
  const iter = <T>(items: T[]) => { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; };
  const wrapFile = (f: FakeFile) => ({
    getUrl: () => f.url,
    getBlob: () => ({ getDataAsString: () => f.content.toString("utf8") }),
    setContent: (s: string) => { f.content = Buffer.from(s, "utf8"); },
  });
  const wrapFolder = (folder: FakeFolder): unknown => ({
    getFoldersByName: (name: string) => { const it = iter(folder.folders.filter((x) => x.name === name)); return { hasNext: it.hasNext, next: () => wrapFolder(it.next()) }; },
    createFolder: (name: string) => { const f = { name, folders: [], files: [] }; folder.folders.push(f); return wrapFolder(f); },
    getFilesByName: (name: string) => { const it = iter(folder.files.filter((x) => x.name === name)); return { hasNext: it.hasNext, next: () => wrapFile(it.next()) }; },
    createFile: (a: unknown, b?: string, mime?: string) => {
      const f: FakeFile = typeof a === "string"
        ? { name: a, content: Buffer.from(b ?? "", "utf8"), mime: mime ?? "text/plain", url: `https://drive.example/file/${++n}` }
        : { name: (a as { name: string }).name, content: (a as { bytes: Buffer }).bytes, mime: (a as { mime: string }).mime, url: `https://drive.example/file/${++n}` };
      folder.files.push(f);
      return wrapFile(f);
    },
  });
  const sandbox = {
    DriveApp: { getFolderById: () => wrapFolder(root) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === "ARCHIVE_SECRET" ? secret : null) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: {
      base64Decode: (s: string) => Buffer.from(s, "base64"),
      newBlob: (bytes: Buffer, mime: string, name: string) => ({ bytes, mime, name }),
    },
    ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: "json" } },
    MimeType: { CSV: "text/csv" },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(__dirname, "../../integrations/google-drive-archive.gs"), "utf8"), sandbox);
  const doPost = (body: unknown) => JSON.parse((sandbox as unknown as { doPost: (e: unknown) => string }).doPost({ postData: { contents: JSON.stringify(body) } }));
  const find = (p: string[]): FakeFolder | undefined => p.reduce<FakeFolder | undefined>((f, name) => f?.folders.find((x) => x.name === name), root);
  return { root, doPost, find };
}
