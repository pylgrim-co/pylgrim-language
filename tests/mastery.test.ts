import { describe, expect, it } from "vitest";
import { computeMastery, weakObjectives, cardObjectives } from "../src/lib/mastery";
import { sampleStory } from "../src/data/sample-story";
import type { Card } from "../src/lib/schema";
import type { StoryV2 } from "../src/lib/schema-v2";
import type { ReviewEvent } from "../src/lib/sync-schema";

/**
 * Work-item criteria (activity-events-and-mastery-fixes):
 * - computeMastery credits v2 dialogue stories
 * - a line carrying objectiveIndex credits that objective ONLY
 * - unattributable cards (quick-translate) are excluded by rule
 */

const OBJECTIVES = ["ask for a table", "order the menu", "pay the bill"];

function v2Story(): StoryV2 {
  const line = (id: string, objectiveIndex: number | null) => ({
    id,
    speaker: "You",
    isLearner: true,
    l1Text: "the bill, please",
    targetText: "la cuenta, por favor",
    payload: objectiveIndex !== null,
    objectiveIndex,
    pairs: [],
  });
  return {
    format: "dialogue-tiers",
    id: "v2-story-1",
    targetLang: "es",
    region: "es-ES",
    register: "neutral",
    level: "A2",
    titleL1: "At the restaurant",
    titleTarget: "En el restaurante",
    objectives: OBJECTIVES,
    tags: [],
    narrative: [
      { paragraph: 0, text: "You sit down." },
      { paragraph: 1, slot: 0 },
    ],
    tiers: [1, 2, 3, 4, 5].map((tier) => ({
      tier,
      slots: [[line(`t${tier}-l0`, 2), line(`t${tier}-l1`, null)]],
    })),
    createdAt: new Date().toISOString(),
  };
}

function card(id: string, storyId: string, segmentId: string): Card {
  return {
    id,
    l1Text: "the bill, please",
    targetText: "la cuenta, por favor",
    targetLang: "es",
    region: "es-ES",
    storyId,
    segmentId,
    createdAt: new Date().toISOString(),
  };
}

function review(cardId: string, grade: 1 | 2 | 3 | 4): ReviewEvent {
  return {
    id: crypto.randomUUID(),
    cardId,
    grade,
    reviewedAt: new Date().toISOString(),
    stateAfter: {},
    clientId: "t",
  };
}

describe("v2 stories feed mastery", () => {
  it("a practice review on a v2-story card moves that story's objective mastery", () => {
    const story = v2Story();
    // Practice card saved from tier 2, line 0 — carries objectiveIndex 2.
    const c = card("c1", story.id, "t2-l0");
    const mastery = computeMastery([c], [review("c1", 1), review("c1", 3)], [], [story]);
    expect(mastery).toHaveLength(1);
    expect(mastery[0].objective).toBe(OBJECTIVES[2]);
    expect(mastery[0].reviews).toBe(2);
    expect(mastery[0].lapses).toBe(1);
    expect(mastery[0].mastery).toBeCloseTo(0.5);
  });

  it("a line with objectiveIndex credits that objective ONLY, never all three", () => {
    const story = v2Story();
    const c = card("c1", story.id, "t3-l0"); // objectiveIndex 2
    const mastery = computeMastery([c], [review("c1", 1)], [], [story]);
    expect(mastery.map((m) => m.objective)).toEqual([OBJECTIVES[2]]);
  });

  it("a line without an objectiveIndex falls back to the whole story's objectives", () => {
    const story = v2Story();
    const c = card("c1", story.id, "t2-l1"); // objectiveIndex null
    const mastery = computeMastery([c], [review("c1", 3)], [], [story]);
    expect(mastery.map((m) => m.objective).sort()).toEqual([...OBJECTIVES].sort());
  });

  it("v2 lapses steer weak-objective practice", () => {
    const story = v2Story();
    const c = card("c1", story.id, "t2-l0");
    const weak = weakObjectives([c], [review("c1", 1), review("c1", 2)], [], [story]);
    expect(weak).toEqual([OBJECTIVES[2]]);
  });
});

describe("unattributable cards are excluded by rule", () => {
  it("a quick-translate card (dangling storyId) contributes nothing and does not throw", () => {
    const dangling = card("qt1", crypto.randomUUID(), "seg"); // synthetic story never saved
    const attributed = card("c1", sampleStory.core.id, "s1");
    const events = [review("qt1", 1), review("qt1", 1), review("c1", 3)];
    const mastery = computeMastery([dangling, attributed], events, [sampleStory], []);
    // Only the sample story's objectives appear; the two quick-translate
    // lapses moved nothing.
    for (const m of mastery) {
      expect(sampleStory.core.objectives).toContain(m.objective);
      expect(m.lapses).toBe(0);
    }
  });

  it("cardObjectives names the rule: null for unknown stories, objectives otherwise", () => {
    const v1Map = new Map([[sampleStory.core.id, sampleStory]]);
    const v2 = v2Story();
    const v2Map = new Map([[v2.id, v2]]);
    expect(cardObjectives(card("x", "nowhere", "s"), v1Map, v2Map)).toBeNull();
    expect(cardObjectives(card("x", sampleStory.core.id, "s"), v1Map, v2Map)).toEqual(sampleStory.core.objectives);
    expect(cardObjectives(card("x", v2.id, "t1-l0"), v1Map, v2Map)).toEqual([OBJECTIVES[2]]);
  });
});
