import { describe, expect, it } from "vitest";
import { ALIGNMENT_FLOOR, alignmentReport, toStoredStory } from "../src/lib/offsets";
import type { GeneratedStory } from "../src/lib/schema";

/**
 * The weave is the product, and a story whose alignment failed still
 * parses, still renders and still reads — it just barely flips. That is
 * the one failure mode that hides, and it gets likelier the moment a
 * self-hoster can point the app at any model they like.
 *
 * So the ingest drop is measured rather than silent.
 */

function story(pairs: { l1: [number, number]; target: [number, number] }[]): GeneratedStory {
  return {
    title_l1: "At the counter",
    title_target: "En el mostrador",
    segments: [
      {
        paragraph: 0,
        l1_text: "She asked for a coffee at the counter",
        target_text: "Pidió un café en el mostrador",
        payload: true,
        plot_critical: false,
        pairs: pairs.map((p) => ({
          l1_words: p.l1,
          target_words: p.target,
          granularity: "phrase" as const,
          payload: true,
          frequency_rank: 3,
          plot_critical: false,
        })),
      },
    ],
  };
}

// Three pairs over the sentence above that touch neither each other's
// English nor each other's Spanish: "She asked", "a coffee", "at the
// counter" against "Pidió", "un café", "en el mostrador".
const GOOD = { l1: [0, 2] as [number, number], target: [0, 1] as [number, number] };
const GOOD_B = { l1: [3, 5] as [number, number], target: [1, 3] as [number, number] };
const GOOD_C = { l1: [5, 8] as [number, number], target: [3, 6] as [number, number] };
/** Word index far past the end of either text — unusable. */
const OUT_OF_RANGE = { l1: [40, 44] as [number, number], target: [40, 44] as [number, number] };
/** The same span as GOOD on both sides, so it collides and is dropped. */
const OVERLAPS = { l1: [0, 2] as [number, number], target: [0, 1] as [number, number] };

describe("alignmentReport counts what survived ingest", () => {
  it("reports a clean story as fully aligned", () => {
    const r = alignmentReport(story([GOOD]));
    expect(r).toEqual({ proposed: 1, kept: 1, rate: 1 });
  });

  it("counts out-of-range spans as lost", () => {
    const r = alignmentReport(story([GOOD, OUT_OF_RANGE]));
    expect(r.proposed).toBe(2);
    expect(r.kept).toBe(1);
    expect(r.rate).toBe(0.5);
  });

  it("counts overlapping spans as lost", () => {
    const r = alignmentReport(story([GOOD, OVERLAPS]));
    expect(r.kept).toBe(1);
    expect(r.rate).toBe(0.5);
  });

  it("treats a story that proposed nothing as aligned rather than failed", () => {
    // No pairs is a legitimate (if dull) story; it is not a model failure,
    // and dividing by zero would report it as one.
    expect(alignmentReport(story([])).rate).toBe(1);
  });

  it("agrees with what toStoredStory actually keeps", () => {
    const gen = story([GOOD, OUT_OF_RANGE, OVERLAPS]);
    const report = alignmentReport(gen);
    const stored = toStoredStory(gen, {
      id: "s1",
      targetLang: "es",
      region: "es-ES",
      register: "formal",
      level: "A2",
      objectives: ["order a coffee"],
      l1: "en",
      createdAt: new Date(0).toISOString(),
    });
    const kept = stored.rendering.segments.reduce((n, s) => n + s.pairs.length, 0);
    // The report must not be a second opinion — it is the same computation.
    expect(report.kept).toBe(kept);
  });
});

describe("the floor is set where a real failure is", () => {
  it("passes a story with an ordinary off-by-one", () => {
    const r = alignmentReport(story([GOOD, GOOD_B, GOOD_C, OUT_OF_RANGE]));
    // 3 of 4 — one bad pair in a good story must not trigger a re-run.
    expect(r.rate).toBeGreaterThanOrEqual(ALIGNMENT_FLOOR);
  });

  it("catches a story where alignment broadly failed", () => {
    const r = alignmentReport(story([GOOD, OUT_OF_RANGE, OUT_OF_RANGE, OUT_OF_RANGE]));
    expect(r.rate).toBeLessThan(ALIGNMENT_FLOOR);
  });
});
