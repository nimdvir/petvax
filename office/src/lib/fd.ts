/** Small helpers for reading HTML form posts in server actions. */
export const fstr = (fd: FormData, k: string): string | null => {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 5000) : null;
};
export const fnum = (fd: FormData, k: string): number | null => {
  const v = fstr(fd, k);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const fint = (fd: FormData, k: string): number | null => {
  const n = fnum(fd, k);
  return n === null ? null : Math.round(n);
};
export const fbool = (fd: FormData, k: string): boolean | null => {
  const v = fstr(fd, k);
  if (v === null) return null;
  return ["yes", "true", "on", "1"].includes(v.toLowerCase()) ? true : ["no", "false", "0"].includes(v.toLowerCase()) ? false : null;
};
export const fdate = (fd: FormData, k: string): string | null => {
  const v = fstr(fd, k);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
export const msg = (path: string, kind: "ok" | "error", text: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`;
/** Strip characters that have meaning in PostgREST filter strings. */
export const searchSafe = (q: string) => q.replace(/[,()*%\\:."']/g, " ").trim().slice(0, 80);
