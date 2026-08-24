import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { deriveQuiz, recordQuizAnswer, findOrCreateQuizCard, type ChoiceItem } from "../src/lib/quiz";
import { sampleStory } from "../src/data/sample-story";
import { db } from "../src/lib/db";
import { reviveScheduling } from "../src/lib/review";
import type { StoryV2 } from "../src/lib/schema-v2";
import { wordSpanToCharSpan } from "../src/lib/offsets";
import { FLAGS } from "../src/edition/flags";

/**
 * Work-item criteria (derived-per-story-quizzes): deterministic
 * derivation from the shared span-pair substrate, zero network, answers
 * feeding the existing review loop on practice-keyed cards, and the
 * v2-only reorder type.
 */

function pairFor(l1Text: string, targetText: string, l1Words: [number, number], targetWords: [number, number], id: string, rank = 2) {
  return {
    id,
    l1: wordSpanToCharSpan(l1Text, l1Words)!,
    target: wordSpanToCharSpan(targetText, targetWords)!,
    granularity: "phrase" as const,
    payload: true,
    frequencyRank: rank,
    plotCritical: false,
  };
}

function v2Story(): StoryV2 {
  const mk = (id: string, speaker: string, isLearner: boolean, l1Text: string, targetText: string, objectiveIndex: number | null) => ({
    id,
    speaker,
    isLearner,
    l1Text,
    targetText,
    payload: objectiveIndex !== null,
    objectiveIndex,
    pairs: [pairFor(l1Text, targetText, [0, 2], [0, 2], `${id}-p0`)],
  });
  const slot = (t: number) => [
    mk(`t${t}-l0`, "Chemist", false, "good morning, what do you need", "buenos días, qué necesita", 0),
    mk(`t${t}-l1`, "You", true, "something for a headache please", "algo para el dolor de cabeza", 1),
    mk(`t${t}-l2`, "Chemist", false, "we have these tablets here", "tenemos estas pastillas aquí", null),
    mk(`t${t}-l3`, "You", true, "how often do I take them", "cada cuánto las tomo", 1),
  ];
  return {
    format: "dialogue-tiers",
    id: "quiz-v2-1",
    targetLang: "es",
    region: "es-ES",
    register: "neutral",
    level: "A2",
    titleL1: "Pharmacy",
    titleTarget: "La farmacia",
    objectives: ["greet the chemist", "describe symptoms"],
    tags: [],
    narrative: [
      { paragraph: 0, text: "You walk in." },
      { paragraph: 1, slot: 0 },
    ],
    tiers: [1, 2, 3, 4, 5].map((tier) => ({ tier, slots: [slot(tier)] })),
    createdAt: new Date().toISOString(),
  };
}

describe("derivation", () => {
  it("derives choice items from a weave story's span pairs, no reorder", () => {
    const quiz = deriveQuiz({ format: "weave", story: sampleStory });
    expect(quiz.items.length).toBeGreaterThan(0);
    const kinds = new Set(quiz.items.map((i) => i.kind));
    expect(kinds.has("reorder")).toBe(false); // v2 only
    // Every choice item has 3-4 options exactly one of which is correct.
    for (const item of quiz.items) {
      if (item.kind === "reorder") continue;
      expect(item.options.length).toBeGreaterThanOrEqual(3);
      expect(item.options.some((o) => o.id === item.correctId)).toBe(true);
      const texts = item.options.map((o) => o.text.trim().toLowerCase());
      expect(new Set(texts).size).toBe(texts.length); // no duplicate options
    }
  });

  it("derives from a v2 tier including the reorder type", () => {
    const quiz = deriveQuiz({ format: "dialogue-tiers", story: v2Story(), tier: 3 });
    expect(quiz.items.length).toBeGreaterThan(0);
    expect(quiz.items.some((i) => i.kind === "reorder")).toBe(true);
    expect(quiz.difficulty).toBe(3);
    // Payload lines carry their objective through to the item.
    const withObjective = quiz.items.filter((i): i is ChoiceItem => i.kind !== "reorder" && i.objective !== null);
    expect(withObjective.length).toBeGreaterThan(0);
  });

  it("cloze items blank the span inside its own sentence", () => {
    const quiz = deriveQuiz({ format: "weave", story: sampleStory });
    for (const item of quiz.items) {
      if (item.kind !== "cloze") continue;
      expect(item.prompt).toContain("____");
      expect(item.prompt).not.toContain(item.targetText);
    }
  });

  it("the same story and seed produce an identical quiz; a new seed varies it", () => {
    const a = deriveQuiz({ format: "weave", story: sampleStory, }, { seed: 7 });
    const b = deriveQuiz({ format: "weave", story: sampleStory, }, { seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = deriveQuiz({ format: "weave", story: sampleStory }, { seed: 8 });
    // Same item bank, but option order/choice varies with the seed.
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });
});

describe("no network anywhere", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("network touched during quiz");
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("a signed-out user derives and answers a full quiz with fetch disabled", async () => {
    await db.clearStore("queue");
    const quiz = deriveQuiz({ format: "weave", story: sampleStory });
    const choice = quiz.items.find((i): i is ChoiceItem => i.kind !== "reorder")!;
    await recordQuizAnswer(quiz, choice, true, "test-client");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Queued for a later push — but only where there is something to
    // push to. The open-source edition writes no queue at all (see
    // db.enqueue); the assertion that matters either way is the one
    // below: nothing went over the network.
    if (FLAGS.HAS_SYNC) expect((await db.listQueue()).length).toBeGreaterThan(0);
  });
});

describe("the review-loop bridge", () => {
  beforeEach(async () => {
    for (const c of await db.listCards()) await db.deleteCard(c.id);
    await db.clearStore("queue");
    await db.clearStore("reviewEvents");
  });

  it("answering records a review event and creates a card keyed like practice cards", async () => {
    const quiz = deriveQuiz({ format: "weave", story: sampleStory });
    const choice = quiz.items.find((i): i is ChoiceItem => i.kind !== "reorder")!;
    await recordQuizAnswer(quiz, choice, false, "test-client");

    const events = await db.listReviewEvents();
    expect(events).toHaveLength(1);
    expect(events[0].grade).toBe(1); // a miss grades Again

    const cards = await db.listCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].storyId).toBe(sampleStory.core.id);
    expect(cards[0].targetText).toBe(choice.targetText);
    expect(reviveScheduling(cards[0].scheduling)).not.toBeNull();
  });

  it("re-answering the same phrase reuses the card instead of duplicating", async () => {
    const quiz = deriveQuiz({ format: "weave", story: sampleStory });
    const choice = quiz.items.find((i): i is ChoiceItem => i.kind !== "reorder")!;
    await recordQuizAnswer(quiz, choice, false, "t");
    await recordQuizAnswer(quiz, choice, true, "t");
    expect(await db.listCards()).toHaveLength(1);
    const events = await db.listReviewEvents();
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.grade).sort()).toEqual([1, 3]); // miss=Again, correct=Good

    // The same card also reuses across quiz/practice: keyed (storyId, targetText).
    const card = await findOrCreateQuizCard(quiz, choice);
    expect(card.id).toBe((await db.listCards())[0].id);
  });
});
