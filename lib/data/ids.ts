import { randomUUID } from "node:crypto";

/** Prefixed ids keep traces readable: prd_…, pol_…, rem_… */
export function newId(prefix: "usr" | "prd" | "pol" | "rem"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
