import type { CharSpan, GeneratedStory, Story, SpanPair } from "./schema";

/**
 * Word-index spans (what the model emits) → character-offset spans (what we
 * store). Models count words reliably and characters unreliably; the stored
 * form stays character offsets per the charter, and this conversion is
 * deterministic and lossless.
 */

export interface Token {
  start: number;
  end: number; // exclusive
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/**
 * [startWord, endWordExclusive) → [startChar, endCharExclusive).
 * Returns null when the word span is out of range or empty.
 */
export function wordSpanToCharSpan(text: string, span: [number, number]): CharSpan | null {
  const [s, e] = span;
  if (e <= s) return null;
  const tokens = tokenize(text);
  if (s < 0 || e > tokens.length) return null;
  return [tokens[s].start, tokens[e - 1].end];
}

export function sliceSpan(text: string, span: CharSpan): string {
  return text.slice(span[0], span[1]);
}

function spansOverlap(a: CharSpan, b: CharSpan): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Drop pairs whose spans are invalid or overlap an earlier (position-sorted)
 * pair on either side. Generation output is untrusted; a dropped pair loses a
 * flip affordance, never correctness.
 */
export function sanitizePairs(pairs: SpanPair[]): SpanPair[] {
  const sorted = [...pairs].sort((a, b) => a.l1[0] - b.l1[0]);
  const kept: SpanPair[] = [];
  for (const p of sorted) {
    if (p.l1[1] <= p.l1[0] || p.target[1] <= p.target[0]) continue;
    const collides = kept.some((k) => spansOverlap(k.l1, p.l1) || spansOverlap(k.target, p.target));
    if (!collides) kept.push(p);
  }
  return kept;
}

/**
 * GeneratedStory (word-index form, straight from the model) → stored Story
 * (character-offset form). Invalid pairs are dropped, not repaired.
 */
export function toStoredStory(
  gen: GeneratedStory,
  meta: {
    id: string;
    targetLang: string;
    region: string;
    register: "formal" | "informal" | "neutral";
    level: "A1" | "A2" | "B1" | "B2" | "C1";
    objectives: string[];
    l1: string;
    intent?: string;
    createdAt: string;
  },
): Story {
  const core = {
    id: meta.id,
    targetLang: meta.targetLang,
    region: meta.region,
    register: meta.register,
    level: meta.level,
    title: gen.title_target,
    objectives: meta.objectives,
    segments: gen.segments.map((s, i) => ({
      id: `${meta.id}-s${i}`,
      paragraph: s.paragraph,
      targetText: s.target_text,
      payload: s.payload,
      plotCritical: s.plot_critical,
    })),
  };

  const rendering = {
    storyId: meta.id,
    l1: meta.l1,
    title: gen.title_l1,
    segments: gen.segments.map((s, i) => {
      const raw: SpanPair[] = [];
      s.pairs.forEach((p, j) => {
        const l1 = wordSpanToCharSpan(s.l1_text, p.l1_words);
        const target = wordSpanToCharSpan(s.target_text, p.target_words);
        if (!l1 || !target) return; // out-of-range: drop
        raw.push({
          id: `${meta.id}-s${i}-p${j}`,
          l1,
          target,
          granularity: p.granularity,
          payload: p.payload,
          frequencyRank: p.frequency_rank,
          plotCritical: p.plot_critical,
        });
      });
      return { segmentId: `${meta.id}-s${i}`, l1Text: s.l1_text, pairs: sanitizePairs(raw) };
    }),
  };

  return { core, rendering, createdAt: meta.createdAt, intent: meta.intent };
}

/**
 * How much of a generated story's alignment actually survived ingest.
 *
 * Dropping a bad pair loses a flip affordance, never correctness — which
 * makes it exactly the kind of failure that hides. A model that cannot
 * hold the schema produces a document that parses, renders, reads fine,
 * and barely flips, with nothing anywhere saying so. That is worse than a
 * failed generation, because the weave IS the product.
 *
 * So: count what the model proposed against what was usable, and let the
 * caller decide. Anthropic sits close to 1; a model that cannot do
 * word-index alignment falls off a cliff, and the gap is obvious.
 */
export interface AlignmentReport {
  proposed: number;
  kept: number;
  /** kept / proposed, or 1 when a story legitimately proposed nothing */
  rate: number;
}

export function alignmentReport(gen: GeneratedStory): AlignmentReport {
  let proposed = 0;
  let kept = 0;
  for (const s of gen.segments) {
    proposed += s.pairs.length;
    const raw: SpanPair[] = [];
    s.pairs.forEach((p, j) => {
      const l1 = wordSpanToCharSpan(s.l1_text, p.l1_words);
      const target = wordSpanToCharSpan(s.target_text, p.target_words);
      if (!l1 || !target) return;
      raw.push({
        id: `probe-${j}`,
        l1,
        target,
        granularity: p.granularity,
        payload: p.payload,
        frequencyRank: p.frequency_rank,
        plotCritical: p.plot_critical,
      });
    });
    kept += sanitizePairs(raw).length;
  }
  return { proposed, kept, rate: proposed === 0 ? 1 : kept / proposed };
}

/**
 * Below this, the story is not really woven. Set from observation rather
 * than taste: a capable model lands well above 0.9, and the occasional
 * off-by-one costs a point or two. Half the pairs failing is a different
 * kind of event.
 */
export const ALIGNMENT_FLOOR = 0.6;
