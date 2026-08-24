import type { GeneratedStoryV2, StoryV2, DialogueLine } from "./schema-v2";
import { wordSpanToCharSpan, sanitizePairs } from "./offsets";
import type { SpanPair } from "./schema";

/**
 * Pure v2 logic: conversion, tier selection, complexity and coverage
 * measures. No I/O anywhere in this module — tier switching must stay a
 * client-side selection (charter, reinterpreted per Amendment A1).
 */

/** Generation form → stored form: word-index pairs become char offsets
 *  through the SAME converter path as v1; invalid pairs drop, never repair. */
export function toStoredStoryV2(
  gen: GeneratedStoryV2,
  meta: {
    id: string;
    targetLang: string;
    region: string;
    register: "formal" | "informal" | "neutral";
    level: "A1" | "A2" | "B1" | "B2" | "C1";
    objectives: string[];
    intent?: string;
    createdAt: string;
  },
): StoryV2 {
  return {
    format: "dialogue-tiers",
    id: meta.id,
    targetLang: meta.targetLang,
    region: meta.region,
    register: meta.register,
    level: meta.level,
    titleL1: gen.title_l1,
    titleTarget: gen.title_target,
    objectives: meta.objectives,
    tags: gen.meta?.tags ?? [],
    narrative: gen.narrative.map((b) => ({ paragraph: b.paragraph, text: b.text, slot: b.slot })),
    tiers: gen.tiers
      .slice()
      .sort((a, b) => a.tier - b.tier)
      .map((tier) => ({
        tier: tier.tier,
        slots: tier.slots.map((slot, si) =>
          slot.map((line, li) => {
            const raw: SpanPair[] = [];
            line.pairs.forEach((p, pi) => {
              const l1 = wordSpanToCharSpan(line.l1_text, p.l1_words);
              const target = wordSpanToCharSpan(line.target_text, p.target_words);
              if (!l1 || !target) return;
              raw.push({
                id: `${meta.id}-t${tier.tier}-s${si}-l${li}-p${pi}`,
                l1,
                target,
                granularity: p.granularity,
                payload: p.payload,
                frequencyRank: p.frequency_rank,
                plotCritical: p.plot_critical,
              });
            });
            return {
              id: `${meta.id}-t${tier.tier}-s${si}-l${li}`,
              speaker: line.speaker,
              isLearner: line.is_learner,
              l1Text: line.l1_text,
              targetText: line.target_text,
              payload: line.payload,
              objectiveIndex: line.objective_index,
              pairs: sanitizePairs(raw),
            };
          }),
        ),
      })),
    createdAt: meta.createdAt,
    intent: meta.intent,
  };
}

// ---------- tier selection (the "renderer") ----------

export type V2Block =
  | { kind: "narrative"; paragraph: number; text: string }
  | { kind: "exchange"; paragraph: number; slot: number; lines: DialogueLine[] };

/**
 * Selecting a tier is a pure lookup — zero network, zero regeneration.
 * This function IS the difficulty mechanism for v2.
 */
export function selectTier(story: StoryV2, tier: number): V2Block[] {
  const track = story.tiers.find((t) => t.tier === tier);
  if (!track) throw new Error(`tier ${tier} not present`);
  return story.narrative.map((beat) => {
    if (beat.text !== undefined) {
      return { kind: "narrative" as const, paragraph: beat.paragraph, text: beat.text };
    }
    return {
      kind: "exchange" as const,
      paragraph: beat.paragraph,
      slot: beat.slot!,
      lines: track.slots[beat.slot!] ?? [],
    };
  });
}

// ---------- measures (criteria: escalation and coverage) ----------

/** Mean words per dialogue turn for a tier — the escalation measure. */
export function meanTurnWords(gen: GeneratedStoryV2, tier: number): number {
  const track = gen.tiers.find((t) => t.tier === tier);
  if (!track) return 0;
  const lines = track.slots.flat();
  if (lines.length === 0) return 0;
  const words = lines.reduce((n, l) => n + l.target_text.trim().split(/\s+/).length, 0);
  return words / lines.length;
}

/**
 * True when complexity escalates up the ladder. Strictly increasing mean
 * turn length through tier 4; tier 5 may CONTRACT slightly — native
 * colloquial speech is elliptical and punchy, so its difficulty comes
 * from idiom and pace, not turn length — but must stay above tier 3.
 * (Learned from the first live generation: the model followed the
 * "elliptical" instruction and the naive strict metric punished it.)
 */
export function complexityEscalates(gen: GeneratedStoryV2): boolean {
  const means = [1, 2, 3, 4, 5].map((tier) => meanTurnWords(gen, tier));
  for (let i = 1; i < 4; i++) {
    if (means[i] <= means[i - 1]) return false;
  }
  return means[4] > means[2];
}

/**
 * Coverage: every tier must exercise every objective (payload lines carry
 * objective_index). Returns the list of gaps — empty means covered.
 */
export function coverageGaps(gen: GeneratedStoryV2, objectiveCount: number): string[] {
  const gaps: string[] = [];
  for (const track of gen.tiers) {
    const covered = new Set(
      track.slots.flat().filter((l) => l.payload && l.objective_index !== null).map((l) => l.objective_index as number),
    );
    for (let i = 0; i < objectiveCount; i++) {
      if (!covered.has(i)) gaps.push(`tier ${track.tier} misses objective ${i}`);
    }
  }
  return gaps;
}

/** Learner lines of a tier, in story order — the response-practice sequence. */
export function learnerLines(story: StoryV2, tier: number): DialogueLine[] {
  return selectTier(story, tier)
    .filter((b): b is Extract<V2Block, { kind: "exchange" }> => b.kind === "exchange")
    .flatMap((b) => b.lines)
    .filter((l) => l.isLearner);
}
