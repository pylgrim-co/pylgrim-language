/**
 * Client-safe edition flags. Separate from ./server so components can ask
 * what this edition has without pulling server-only modules (Supabase,
 * node:fs) into the browser bundle.
 *
 * Rewritten to "./oss/flags" by scripts/export-oss.ts.
 */
export { FLAGS } from "./oss/flags";
export type { EditionFlags } from "./types";
