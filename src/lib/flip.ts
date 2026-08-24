import type { RenderedChunk } from "./weave";
import type { Overrides } from "./weave";

/**
 * Flip resolution for taps and multi-chunk selections. A flip is a lookup
 * against the alignment, never a translation call.
 */

export interface Flippable {
  key: string; // pairId or segmentId — the override key
  currentLang: string;
  targetLang: string;
}

export function flippableFromChunk(chunk: RenderedChunk, targetLang: string): Flippable | null {
  if (chunk.pairId) return { key: chunk.pairId, currentLang: chunk.lang, targetLang };
  if (chunk.wholeSegment || chunk.counterpart === "") {
    // Scaffold text between pairs flips the whole segment; whole-segment
    // chunks flip themselves.
    return { key: chunk.segmentId, currentLang: chunk.lang, targetLang };
  }
  return null;
}

/** Toggle a single flippable. */
export function toggleFlip(overrides: Overrides, f: Flippable): Overrides {
  const next = { ...overrides };
  next[f.key] = f.currentLang === f.targetLang ? "l1" : "target";
  return next;
}

/**
 * Flip a multi-chunk selection as a unit. Direction rule: if ANY selected
 * chunk is currently in L1, flip everything to the target language;
 * otherwise flip everything back to L1. Spanning multiple aligned pairs —
 * or pairs plus scaffold — is the normal case, not an edge case.
 */
export function flipSelection(overrides: Overrides, flippables: Flippable[], targetLang: string): Overrides {
  if (flippables.length === 0) return overrides;
  const anyInL1 = flippables.some((f) => f.currentLang !== targetLang);
  const direction: "l1" | "target" = anyInL1 ? "target" : "l1";
  const next = { ...overrides };
  const seen = new Set<string>();
  for (const f of flippables) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    next[f.key] = direction;
  }
  return next;
}

/**
 * Both sides of a selection, for card capture. Chunks must be in document
 * order; adjacent chunks from the same segment join with their original
 * spacing lost, so we join on a single space — cards are phrases, not
 * typography.
 */
export function selectionSides(chunks: RenderedChunk[], targetLang: string): { l1: string; target: string } {
  const l1Parts: string[] = [];
  const targetParts: string[] = [];
  for (const c of chunks) {
    const own = c.text.trim();
    const other = c.counterpart.trim();
    if (c.lang === targetLang) {
      if (own) targetParts.push(own);
      if (other) l1Parts.push(other);
    } else {
      if (own) l1Parts.push(own);
      if (other) targetParts.push(other);
    }
  }
  return { l1: l1Parts.join(" "), target: targetParts.join(" ") };
}
