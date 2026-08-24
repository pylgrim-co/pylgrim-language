/**
 * THE edition entry point for server code. See ./types.ts for what this
 * contract is and why it exists.
 *
 * The line below is the switch. `scripts/export-oss.ts` rewrites it to
 * "./oss/server" and deletes ./cloud/ entirely — so if anything hosted
 * ever creeps outside src/edition/cloud/, the open-source build stops
 * compiling rather than quietly shipping it.
 */
export * from "./oss/server";
export * from "./types";
