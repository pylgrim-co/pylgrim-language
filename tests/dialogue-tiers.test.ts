import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { generatedStoryV2Schema } from "../src/lib/schema-v2";
import {
  toStoredStoryV2,
  selectTier,
  meanTurnWords,
  complexityEscalates,
  coverageGaps,
  learnerLines,
} from "../src/lib/dialogue";
import { sampleStoryV2Gen, SAMPLE_V2_OBJECTIVES } from "../src/data/sample-story-v2";
import { sliceSpan } from "../src/lib/offsets";
import { PRACTICE_GRADE, findOrCreatePracticeCard, recordPractice } from "../src/lib/practice";
import { db } from "../src/lib/db";
import { reviveScheduling } from "../src/lib/review";

const stored = toStoredStoryV2(sampleStoryV2Gen, {
  id: "v2-fixture",
  targetLang: "es",
  region: "es-ES",
  register: "formal",
  level: "A2",
  objectives: SAMPLE_V2_OBJECTIVES,
  createdAt: "2026-08-22T00:00:00.000Z",
});

describe("v2 schema", () => {
  it("the fixture validates, including the cross-checks", () => {
    expect(() => generatedStoryV2Schema.parse(sampleStoryV2Gen)).not.toThrow();
  });

  it("a tier that misses a slot is rejected", () => {
    const broken = structuredClone(sampleStoryV2Gen);
    broken.tiers[0].slots = [broken.tiers[0].slots[0]]; // drop slot 1
    expect(() => generatedStoryV2Schema.parse(broken)).toThrow();
  });

  it("tiers must be exactly 1..5", () => {
    const broken = structuredClone(sampleStoryV2Gen);
    broken.tiers[4].tier = 4; // duplicate 4, no 5
    expect(() => generatedStoryV2Schema.parse(broken)).toThrow();
  });
});

describe("conversion (word-index → offsets, same path as v1)", () => {
  it("dialogue-line pairs slice to the intended text on both sides", () => {
    const lineWithPair = stored.tiers[0].slots[0][0];
    expect(lineWithPair.pairs).toHaveLength(1);
    const pair = lineWithPair.pairs[0];
    expect(sliceSpan(lineWithPair.l1Text, pair.l1)).toBe("coffee,");
    expect(sliceSpan(lineWithPair.targetText, pair.target)).toBe("café,");
  });

  it("learner and payload marking survive conversion", () => {
    const l = stored.tiers[2].slots[1][0];
    expect(l.isLearner).toBe(true);
    expect(l.payload).toBe(true);
    expect(l.objectiveIndex).toBe(1);
  });
});

describe("tier selection is the difficulty mechanism (charter, reinterpreted)", () => {
  it("selecting a tier is pure and deterministic", () => {
    const a = selectTier(stored, 3);
    const b = selectTier(stored, 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("interleaves narrative and the chosen tier's exchanges in story order", () => {
    const blocks = selectTier(stored, 1);
    expect(blocks.map((b) => b.kind)).toEqual(["narrative", "exchange", "narrative", "exchange", "narrative"]);
    const exchange = blocks[1];
    expect(exchange.kind).toBe("exchange");
    if (exchange.kind === "exchange") {
      expect(exchange.lines[0].targetText).toBe("Un café, por favor.");
    }
  });

  it("different tiers select different stored content — no regeneration anywhere", () => {
    const t1 = selectTier(stored, 1);
    const t5 = selectTier(stored, 5);
    expect(JSON.stringify(t1)).not.toBe(JSON.stringify(t5));
    expect(() => selectTier(stored, 6)).toThrow();
  });
});

describe("escalation and coverage (route-enforced before pooling)", () => {
  it("mean words per turn strictly increases tier 1 → 5 on the fixture", () => {
    let prev = 0;
    for (let tier = 1; tier <= 5; tier++) {
      const mean = meanTurnWords(sampleStoryV2Gen, tier);
      expect(mean, `tier ${tier}`).toBeGreaterThan(prev);
      prev = mean;
    }
    expect(complexityEscalates(sampleStoryV2Gen)).toBe(true);
  });

  it("a colloquial tier-5 contraction is legitimate (ellipsis is native)", () => {
    const colloquial = structuredClone(sampleStoryV2Gen);
    // Shrink tier 5 below tier 4 but above tier 3 - the live-generation case.
    colloquial.tiers[4].slots = colloquial.tiers[4].slots.map((slot) =>
      slot.map((l) => ({ ...l, target_text: l.target_text.split(/\s+/).slice(0, 9).join(" ") })),
    );
    expect(meanTurnWords(colloquial, 5)).toBeLessThan(meanTurnWords(colloquial, 4));
    expect(meanTurnWords(colloquial, 5)).toBeGreaterThan(meanTurnWords(colloquial, 3));
    expect(complexityEscalates(colloquial)).toBe(true);
  });

  it("a flattened ladder is detected", () => {
    const flat = structuredClone(sampleStoryV2Gen);
    flat.tiers[4].slots = structuredClone(flat.tiers[0].slots); // tier 5 = tier 1
    expect(complexityEscalates(flat)).toBe(false);
  });

  it("every tier exercises every objective; a gap is named precisely", () => {
    expect(coverageGaps(sampleStoryV2Gen, SAMPLE_V2_OBJECTIVES.length)).toEqual([]);
    const gappy = structuredClone(sampleStoryV2Gen);
    gappy.tiers[1].slots[1][0].payload = false;
    gappy.tiers[1].slots[1][0].objective_index = null;
    expect(coverageGaps(gappy, 2)).toEqual(["tier 2 misses objective 1"]);
  });
});

describe("response practice", () => {
  it("learner lines come back in story order, learner-only", () => {
    const lines = learnerLines(stored, 4);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.isLearner)).toBe(true);
    expect(lines[0].objectiveIndex).toBe(0);
    expect(lines[1].objectiveIndex).toBe(1);
  });

  it("self-grades map onto FSRS grades", () => {
    expect(PRACTICE_GRADE.got).toBe(3);
    expect(PRACTICE_GRADE.nearly).toBe(2);
    expect(PRACTICE_GRADE.missed).toBe(1);
  });

  it("practising creates a card once, reuses it after, and appends review events", async () => {
    for (const c of await db.listCards()) await db.deleteCard(c.id);
    await db.clearStore("queue");
    await db.clearStore("reviewEvents");

    const line = learnerLines(stored, 1)[0];
    const first = await findOrCreatePracticeCard(stored, line);
    const second = await findOrCreatePracticeCard(stored, line);
    expect(second.id).toBe(first.id); // reuse, not duplicate

    await recordPractice(stored, line, "missed", "test-client");
    await recordPractice(stored, line, "got", "test-client");

    const events = await db.listReviewEvents();
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.grade).sort()).toEqual([1, 3]);

    // The card's FSRS state advanced — practice feeds the SAME loop.
    const card = (await db.listCards()).find((c) => c.id === first.id)!;
    const scheduling = reviveScheduling(card.scheduling);
    expect(scheduling).not.toBeNull();
    expect(scheduling!.reps).toBeGreaterThanOrEqual(2);
  });

  it("the practice walk needs no network: grading works with fetch disabled", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => {
      throw new Error("network touched during practice");
    }) as unknown as typeof fetch;
    try {
      const line = learnerLines(stored, 2)[0];
      await recordPractice(stored, line, "nearly", "offline-client");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
