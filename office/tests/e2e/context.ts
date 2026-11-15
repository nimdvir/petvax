import { readFileSync } from "node:fs";
export interface E2EContext {
  stamp: number;
  users: Record<"vet" | "admin", { email: string; password: string; name: string }>;
  links: Record<string, string>;
}
export const ctx = (): E2EContext => JSON.parse(readFileSync(".e2e-context.json", "utf8"));
