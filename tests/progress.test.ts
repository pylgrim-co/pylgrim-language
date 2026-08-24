import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  canDoStatements,
  masteryDeltas,
  reReadSuggestion,
  titleIndex,
  weekRecap,
  weekStart,
} from "../src/lib/progress";
import { sampleStory } from "../src/data/sample-story";
import type { ActivityEvent, ReviewEvent } from "../src/lib/sync-schema";
import type { Card } from "../src/lib/schema";

/**
 * Work-item criteria (progress-recap-and-re-read-moment): weekly figures
 * computed client-side from the event logs with zero network; can-do
 * statements from passed quizzes; the re-read offer when a higher
 * difficulty has been proven elsewhere.
 */

// A fixed Saturday; its week runs Mon 17th .. Sun 23rd (local time).
const NOW = new Date(2026, 7, 22, 12, 0, 0);
const thisWeek = (day: number, hour = 10) => new Date(2026, 7, day, hour).toISOString();
const lastWeek = (day: number) => new Date(2026, 7, day, 10).toISOString();

let n = 0;
function activity(kind: ActivityEvent["kind"], occurredAt: string, over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`,
    kind,
    storyId: "story-a",
    format: "weave",
    difficulty: 2,
    occurredAt,
    clientId: "t",
    ...over,
  };
}

function review(occurredAt: string): ReviewEvent {
  return { id: crypto.randomUUID(), cardId: "c", grade: 3, reviewedAt: occurredAt, stateAfter: {}, clientId: "t" };
}

describe("weekRecap", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("network touched computing the recap");
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("computes words read, stories finished and reviews for the local week — zero network", () => {
    const events = [
      activity("story_finished", thisWeek(18), { difficulty: 3, detail: { targetWords: 120 } }),
      activity("story_finished", thisWeek(20), { storyId: "story-b", format: "dialogue-tiers", difficulty: 2, detail: { targetWords: 80 } }),
      activity("story_opened", thisWeek(21)), // opens don't add words
      activity("story_finished", lastWeek(12), { detail: { targetWords: 500 } }), // previous week
      activity("quiz_completed", thisWeek(20, 11), { detail: { correct: 4, total: 5 } }),
    ];
    const reviews = [review(thisWeek(19)), review(thisWeek(19)), review(lastWeek(11))];

    const recap = weekRecap(events, reviews, NOW);
    expect(recap.targetWordsRead).toBe(200);
    expect(recap.storiesFinished).toHaveLength(2);
    expect(recap.storiesFinished.map((f) => f.difficulty).sort()).toEqual([2, 3]);
    expect(recap.cardsReviewed).toBe(2);
    expect(recap.quizzes).toHaveLength(1);
    expect(recap.previous.targetWordsRead).toBe(500);
    expect(recap.previous.cardsReviewed).toBe(1);
    expect(recap.activeDays.length).toBeGreaterThanOrEqual(3);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("can-do statements", () => {
  const titles = titleIndex([sampleStory], [], () => "Spanish");

  it("a passed quiz earns a can-do naming the story and the difficulty it was passed at", () => {
    const events = [
      activity("quiz_completed", thisWeek(19), {
        storyId: sampleStory.core.id,
        difficulty: 3,
        detail: { correct: 5, total: 6 },
      }),
    ];
    const canDo = canDoStatements(events, titles);
    expect(canDo).toHaveLength(1);
    expect(canDo[0].text).toContain("difficulty 3");
    expect(canDo[0].text).toContain("5/6");
  });

  it("a failed quiz earns nothing; a difficulty-5 finish earns the full-language line", () => {
    const events = [
      activity("quiz_completed", thisWeek(19), { storyId: sampleStory.core.id, detail: { correct: 2, total: 6 } }),
      activity("story_finished", thisWeek(20), { storyId: sampleStory.core.id, difficulty: 5, detail: { targetWords: 400 } }),
    ];
    const canDo = canDoStatements(events, titles);
    expect(canDo).toHaveLength(1);
    expect(canDo[0].text).toContain("entirely in Spanish");
  });
});

describe("the re-read moment", () => {
  it("offers the earlier story at the higher difficulty proven elsewhere", () => {
    const events = [
      activity("story_finished", lastWeek(10), { storyId: "early", difficulty: 2 }),
      activity("story_finished", thisWeek(20), { storyId: "recent", difficulty: 4 }),
    ];
    const s = reReadSuggestion(events);
    expect(s).not.toBeNull();
    expect(s!.storyId).toBe("early");
    expect(s!.readAt).toBe(2);
    expect(s!.suggested).toBe(4);
  });

  it("no offer when nothing has headroom", () => {
    const events = [
      activity("story_finished", lastWeek(10), { storyId: "a", difficulty: 3 }),
      activity("story_finished", thisWeek(20), { storyId: "b", difficulty: 3 }),
    ];
    expect(reReadSuggestion(events)).toBeNull();
    expect(reReadSuggestion([])).toBeNull();
  });
});

describe("mastery deltas", () => {
  it("reports before/after for objectives touched since the window start", () => {
    const card: Card = {
      id: "c1",
      l1Text: "x",
      targetText: "y",
      targetLang: "es",
      region: "es-ES",
      storyId: sampleStory.core.id,
      segmentId: "s",
      createdAt: lastWeek(10),
    };
    const mk = (at: string, grade: 1 | 3): ReviewEvent => ({
      id: crypto.randomUUID(),
      cardId: "c1",
      grade,
      reviewedAt: at,
      stateAfter: {},
      clientId: "t",
    });
    const reviews = [mk(lastWeek(11), 1), mk(lastWeek(12), 1), mk(thisWeek(19), 3), mk(thisWeek(20), 3)];
    const deltas = masteryDeltas([card], reviews, [sampleStory], [], weekStart(NOW));
    expect(deltas.length).toBeGreaterThan(0);
    for (const d of deltas) {
      expect(d.before).toBeCloseTo(0); // two lapses before the week
      expect(d.after).toBeCloseTo(0.5); // two goods since
    }
  });
});
