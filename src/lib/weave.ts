import type { Story, SpanPair } from "./schema";
import { sliceSpan } from "./offsets";

/**
 * The weave renderer.
 *
 * Charter: difficulty is a CLIENT-SIDE RENDER over a fixed payload — a pure
 * function of (story, difficulty, overrides). No network, no regeneration,
 * no randomness. Three dials, one visible:
 *
 *   coverage     — proportion of target-language characters on the page
 *   granularity  — which flip sizes are allowed at this difficulty
 *   selection    — WHICH spans flip: payload always; then common items
 *                  first; plot-critical spans last (narrative safety)
 *
 * The payload is invariant: spans and segments carrying the requested
 * objectives render in the target language at EVERY difficulty.
 */

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface WeavePolicy {
  coverage: number; // target fraction of target-language chars
  sentenceFlips: boolean; // whole segments may flip
}

export const WEAVE_POLICY: Record<Difficulty, WeavePolicy> = {
  1: { coverage: 0.08, sentenceFlips: false },
  2: { coverage: 0.2, sentenceFlips: false },
  3: { coverage: 0.45, sentenceFlips: true },
  4: { coverage: 0.7, sentenceFlips: true },
  5: { coverage: 1.0, sentenceFlips: true },
};

export interface RenderedChunk {
  text: string;
  /** BCP-47-ish code for the chunk — drives lang attributes and styling */
  lang: string;
  segmentId: string;
  paragraph: number;
  /** present when the chunk is a flippable aligned span */
  pairId?: string;
  /** true when the whole segment rendered in one language as a unit */
  wholeSegment: boolean;
  /** what the chunk flips to when tapped */
  counterpart: string;
}

export interface RenderedStory {
  paragraphs: RenderedChunk[][][]; // paragraph -> segment -> chunks
  coverage: number; // achieved target-language char fraction
}

/** User tap-to-flip state, layered over the weave. Keyed by pairId or segmentId. */
export type Overrides = Record<string, "l1" | "target">;

interface Candidate {
  kind: "pair" | "segment";
  segmentIndex: number;
  pair?: SpanPair;
  targetChars: number;
  payload: boolean;
  frequencyRank: number;
  plotCritical: boolean;
  position: number; // stable tiebreak: document order
}

/**
 * Deterministic selection: payload first (always in), then common before
 * rare, then non-plot-critical before plot-critical, then document order.
 * Never random — the same story at the same difficulty renders identically
 * every time.
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.payload !== b.payload) return a.payload ? -1 : 1;
  if (a.frequencyRank !== b.frequencyRank) return a.frequencyRank - b.frequencyRank;
  if (a.plotCritical !== b.plotCritical) return a.plotCritical ? 1 : -1;
  return a.position - b.position;
}

export function weave(story: Story, difficulty: Difficulty, overrides: Overrides = {}): RenderedStory {
  const policy = WEAVE_POLICY[difficulty];
  const { core, rendering } = story;

  const totalTargetChars = core.segments.reduce((n, s) => n + s.targetText.length, 0);

  // Build the candidate list.
  const candidates: Candidate[] = [];
  let position = 0;
  core.segments.forEach((seg, i) => {
    const rseg = rendering.segments[i];
    if (policy.sentenceFlips || seg.payload) {
      candidates.push({
        kind: "segment",
        segmentIndex: i,
        targetChars: seg.targetText.length,
        payload: seg.payload,
        plotCritical: seg.plotCritical,
        frequencyRank: 3, // whole sentences sit mid-rank; pairs beat them when common
        position: position++,
      });
    }
    for (const pair of rseg.pairs) {
      candidates.push({
        kind: "pair",
        segmentIndex: i,
        pair,
        targetChars: pair.target[1] - pair.target[0],
        payload: pair.payload,
        frequencyRank: pair.frequencyRank,
        plotCritical: pair.plotCritical,
        position: position++,
      });
    }
  });

  candidates.sort(compareCandidates);

  // Greedy selection to the coverage target. Payload is always selected,
  // even past the target — the payload is invariant.
  const flippedSegments = new Set<number>();
  const flippedPairs = new Set<string>();
  let flippedChars = 0;

  for (const c of candidates) {
    const wouldExceed = flippedChars >= policy.coverage * totalTargetChars;
    if (!c.payload && wouldExceed) continue;
    if (c.kind === "segment") {
      if (flippedSegments.has(c.segmentIndex)) continue;
      flippedSegments.add(c.segmentIndex);
      flippedChars += c.targetChars;
    } else if (c.pair) {
      if (flippedSegments.has(c.segmentIndex) || flippedPairs.has(c.pair.id)) continue;
      flippedPairs.add(c.pair.id);
      flippedChars += c.targetChars;
    }
  }

  // Difficulty 5: everything flips.
  if (policy.coverage >= 1) {
    core.segments.forEach((_, i) => flippedSegments.add(i));
  }

  // Render, applying user overrides on top of the weave.
  const paragraphs: RenderedChunk[][][] = [];
  core.segments.forEach((seg, i) => {
    const rseg = rendering.segments[i];
    const chunks: RenderedChunk[] = [];

    const segOverride = overrides[seg.id];
    const segFlipped = segOverride ? segOverride === "target" : flippedSegments.has(i);

    if (segFlipped) {
      chunks.push({
        text: seg.targetText,
        lang: core.targetLang,
        segmentId: seg.id,
        paragraph: seg.paragraph,
        wholeSegment: true,
        counterpart: rseg.l1Text,
      });
    } else {
      // Scaffold in L1, with selected pairs swapped to the target language.
      const pairs = [...rseg.pairs].sort((a, b) => a.l1[0] - b.l1[0]);
      let cursor = 0;
      for (const pair of pairs) {
        const pairOverride = overrides[pair.id];
        // A segment explicitly flipped to L1 reads as plain L1: weave-selected
        // pair flips are suppressed, explicit pair overrides still win.
        const weaveFlipped = segOverride === "l1" ? false : flippedPairs.has(pair.id);
        const pairFlipped = pairOverride ? pairOverride === "target" : weaveFlipped;
        if (pair.l1[0] > cursor) {
          chunks.push({
            text: rseg.l1Text.slice(cursor, pair.l1[0]),
            lang: rendering.l1,
            segmentId: seg.id,
            paragraph: seg.paragraph,
            wholeSegment: false,
            counterpart: "",
          });
        }
        chunks.push({
          text: pairFlipped ? sliceSpan(seg.targetText, pair.target) : sliceSpan(rseg.l1Text, pair.l1),
          lang: pairFlipped ? core.targetLang : rendering.l1,
          segmentId: seg.id,
          paragraph: seg.paragraph,
          pairId: pair.id,
          wholeSegment: false,
          counterpart: pairFlipped ? sliceSpan(rseg.l1Text, pair.l1) : sliceSpan(seg.targetText, pair.target),
        });
        cursor = pair.l1[1];
      }
      if (cursor < rseg.l1Text.length) {
        chunks.push({
          text: rseg.l1Text.slice(cursor),
          lang: rendering.l1,
          segmentId: seg.id,
          paragraph: seg.paragraph,
          wholeSegment: false,
          counterpart: "",
        });
      }
    }

    while (paragraphs.length <= seg.paragraph) paragraphs.push([]);
    paragraphs[seg.paragraph].push(chunks);
  });

  // Achieved coverage, measured on what actually rendered.
  let achieved = 0;
  for (const para of paragraphs) {
    for (const segChunks of para) {
      for (const c of segChunks) {
        if (c.lang === core.targetLang) achieved += c.text.length;
      }
    }
  }

  return { paragraphs, coverage: totalTargetChars ? achieved / totalTargetChars : 0 };
}
