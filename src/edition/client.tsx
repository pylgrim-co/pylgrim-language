/**
 * THE edition entry point for client code. See ./types.ts.
 *
 * Rewritten to "./oss/client" by scripts/export-oss.ts, which then deletes
 * ./cloud/ — so an accidental import of a hosted surface fails the export
 * build rather than shipping a pool browser that talks to nothing.
 */
export * from "./oss/client";
