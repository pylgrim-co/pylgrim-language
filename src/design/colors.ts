/**
 * Hex mirrors of the two --bg token values in app/styles/tokens.css.
 * The web manifest and theme-color meta need literal hex (not OKLCH vars),
 * so exactly these two values are duplicated here — nothing else.
 * If tokens.css changes --paper or --ink-paper, update these to match.
 */
export const PAPER_BG_HEX = "#ffffff"; // oklch(100% 0 0)
export const INK_BG_HEX = "#0c0d0f"; // oklch(16% 0.004 255) — hex per Lightning CSS's own conversion
