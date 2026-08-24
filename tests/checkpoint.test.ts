import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sharedGenerationRequestSchema } from "../src/lib/generation-request";
import { checkpointObjectives, CHECKPOINT_MAX_OBJECTIVES } from "../src/lib/checkpoint";
import { deriveQuiz, recordQuizAnswer, type ChoiceItem } from "../src/lib/quiz";
import { masteryDeltas } from "../src/lib/progress";
import { db } from "../src/lib/db";
import { wordSpanToCharSpan } from "../src/lib/offsets";
import type { StoryV2 } from "../src/lib/schema-v2";
import { FLAGS } from "../src/edition/flags";

/**
 * Work-item criteria (checkpoint-stories): the request schema carries no
 * intent field (route-level, by construction — the route parses with this
 * exact schema); the objective union is deduped and capped; quiz results
 * over a checkpoint story land per-objective in mastery so the recap can
 * show before/after; quota counts checkpoints like any generation.
 */

const VALID = {
  objectives: ["order a coffee", "ask for the bill"],
  targetLang: "es",
  region: "es-ES",
  register: "neutral",
  level: "A2",
  format: "dialogue-tiers",
};

// The pool-backed shared route only exists in the hosted build.
describe.runIf(FLAGS.HAS_POOL)("the request schema (route-level, shared with the handler)", () => {
  it("accepts a checkpoint request and defaults purpose to standard", () => {
    const checkpoint = sharedGenerationRequestSchema.safeParse({ ...VALID, purpose: "checkpoint" });
    expect(checkpoint.success).toBe(true);
    const standard = sharedGenerationRequestSchema.safeParse(VALID);
    expect(standard.success).toBe(true);
    expect(standard.success && standard.data.purpose).toBe("standard");
  });

  it("carries NO intent field — an intent key is rejected by construction", () => {
    expect(sharedGenerationRequestSchema.safeParse({ ...VALID, intent: "my private plans" }).success).toBe(false);
    expect(sharedGenerationRequestSchema.safeParse({ ...VALID, purpose: "checkpoint", intent: "x" }).success).toBe(false);
    // ...and so is any other stray key.
    expect(sharedGenerationRequestSchema.safeParse({ ...VALID, anythingElse: 1 }).success).toBe(false);
  });

  it("the shared route parses with this exact schema", () => {
    const route = readFileSync(join(__dirname, "..", "app", "api", "v1", "generate", "shared", "route.ts"), "utf8");
    expect(route).toContain("sharedGenerationRequestSchema");
    // No intent key or property anywhere in the handler (comments may
    // state the invariant; code may not touch one).
    expect(route).not.toMatch(/\.intent\b|\bintent\s*:/);
  });
});

// Quotas and the migration that records them are hosted-only.
describe.runIf(FLAGS.HAS_BILLING)("quota counts checkpoints like any generation", () => {
  it("the route-boundary quota query includes the checkpoint kind", () => {
    const billing = readFileSync(join(__dirname, "..", "src", "lib", "server", "billing.ts"), "utf8");
    expect(billing).toContain('.in("kind", ["generate", "regen", "checkpoint"])');
  });

  it("the migration admits the checkpoint kind", () => {
    const migration = readFileSync(join(__dirname, "..", "supabase", "migrations", "20260822000002_checkpoint_kind.sql"), "utf8");
    expect(migration).toContain("'checkpoint'");
  });
});

describe("objective union", () => {
  it("dedupes case-insensitively, weak points first, capped at the schema limit", () => {
    const union = checkpointObjectives(
      [
        { objectives: ["Order a coffee", "ask for the bill"] },
        { objectives: ["order a coffee", "book a table"] }, // dup differs only by case
      ],
      ["ask for the bill", "describe symptoms"],
    );
    expect(union[0]).toBe("ask for the bill"); // weak first
    expect(union[1]).toBe("describe symptoms");
    expect(union.filter((o) => o.toLowerCase() === "order a coffee")).toHaveLength(1);
    expect(union).toContain("book a table");
  });

  it("caps at the request schema's maximum", () => {
    const many = Array.from({ length: 20 }, (_, i) => `objective number ${i}`);
    const union = checkpointObjectives([{ objectives: many }]);
    expect(union).toHaveLength(CHECKPOINT_MAX_OBJECTIVES);
  });
});

describe("checkpoint quiz results land per-objective in mastery", () => {
  function checkpointStory(): StoryV2 {
    const mk = (id: string, l1Text: string, targetText: string, objectiveIndex: number) => ({
      id,
      speaker: "You",
      isLearner: true,
      l1Text,
      targetText,
      payload: true,
      objectiveIndex,
      pairs: [
        {
          id: `${id}-p0`,
          l1: wordSpanToCharSpan(l1Text, [0, 2] as [number, number])!,
          target: wordSpanToCharSpan(targetText, [0, 2] as [number, number])!,
          granularity: "phrase" as const,
          payload: true,
          frequencyRank: 2,
          plotCritical: false,
        },
      ],
    });
    const slot = (t: number) => [
      mk(`t${t}-l0`, "a coffee with milk please", "un café con leche por favor", 0),
      mk(`t${t}-l1`, "the bill please when you can", "la cuenta por favor cuando pueda", 1),
      mk(`t${t}-l2`, "do you have a free table", "tiene una mesa libre", 2),
    ];
    return {
      format: "dialogue-tiers",
      id: "checkpoint-1",
      targetLang: "es",
      region: "es-ES",
      register: "neutral",
      level: "A2",
      titleL1: "Checkpoint",
      titleTarget: "Punto de control",
      objectives: ["order a coffee", "ask for the bill", "book a table"],
      tags: [],
      narrative: [
        { paragraph: 0, text: "The test." },
        { paragraph: 1, slot: 0 },
      ],
      tiers: [1, 2, 3, 4, 5].map((tier) => ({ tier, slots: [slot(tier)] })),
      createdAt: new Date().toISOString(),
    };
  }

  beforeEach(async () => {
    for (const c of await db.listCards()) await db.deleteCard(c.id);
    await db.clearStore("reviewEvents");
    await db.clearStore("queue");
  });

  it("answering the checkpoint's quiz produces before/after mastery for its objectives", async () => {
    const story = checkpointStory();
    await db.putStoryV2(story);
    const quiz = deriveQuiz({ format: "dialogue-tiers", story, tier: 2 });
    const choices = quiz.items.filter((i): i is ChoiceItem => i.kind !== "reorder" && i.objective !== null);
    expect(choices.length).toBeGreaterThan(0);

    for (const item of choices) await recordQuizAnswer(quiz, item, item.objective !== "ask for the bill", "t");

    const cards = await db.listCards();
    const reviews = await db.listReviewEvents();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const deltas = masteryDeltas(cards, reviews, [], [story], weekAgo);

    // Every quizzed objective appears with fresh (before: null) mastery.
    const quizzed = new Set(choices.map((c) => c.objective));
    for (const objective of quizzed) {
      const d = deltas.find((x) => x.objective === objective);
      expect(d, `delta for ${objective}`).toBeDefined();
      expect(d!.before).toBeNull();
    }
    // The missed objective shows imperfect mastery; a passed one shows 1.
    const missed = deltas.find((d) => d.objective === "ask for the bill");
    if (missed) expect(missed.after).toBeLessThan(1);
  });
});
