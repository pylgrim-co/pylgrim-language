import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { Card } from "../src/lib/schema";
import { dueCards, gradeCard, reviveScheduling } from "../src/lib/review";
import { recordReview } from "../src/lib/mutations";
import { db } from "../src/lib/db";
import { FLAGS } from "../src/edition/flags";

function makeCard(id: string, scheduling?: unknown): Card {
  return {
    id,
    l1Text: "the bill",
    targetText: "la cuenta",
    targetLang: "es",
    region: "es-ES",
    storyId: "s",
    segmentId: "seg",
    createdAt: new Date().toISOString(),
    scheduling,
  };
}

describe("scheduling", () => {
  it("a new card is due immediately", () => {
    const due = dueCards([makeCard("a")]);
    expect(due).toHaveLength(1);
  });

  it("grading produces a future due date, ordered by grade strength", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const again = gradeCard(makeCard("a"), 1, "t", now);
    const good = gradeCard(makeCard("a"), 3, "t", now);
    const easy = gradeCard(makeCard("a"), 4, "t", now);
    const dueOf = (r: typeof again) => reviveScheduling(r.updatedCard.scheduling)!.due.getTime();
    expect(dueOf(again)).toBeGreaterThanOrEqual(now.getTime());
    expect(dueOf(good)).toBeGreaterThan(dueOf(again));
    expect(dueOf(easy)).toBeGreaterThan(dueOf(good));
  });

  it("scheduling state survives a JSON round-trip (IndexedDB/jsonb form)", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const first = gradeCard(makeCard("a"), 3, "t", now);
    const serialised = JSON.parse(JSON.stringify(first.updatedCard)) as Card;
    const later = new Date("2026-12-01T12:00:00.000Z");
    const second = gradeCard(serialised, 3, "t", later);
    const s = reviveScheduling(second.updatedCard.scheduling)!;
    expect(s.due.getTime()).toBeGreaterThan(later.getTime());
    expect(s.reps).toBe(2);
  });

  it("a graded card leaves the due queue until its due date", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const { updatedCard } = gradeCard(makeCard("a"), 4, "t", now);
    expect(dueCards([updatedCard], new Date(now.getTime() + 60_000))).toHaveLength(0);
    expect(dueCards([updatedCard], new Date("2030-01-01T00:00:00.000Z"))).toHaveLength(1);
  });

  it("the grade event carries the state it produced", () => {
    const { updatedCard, event } = gradeCard(makeCard("a"), 2, "client-x");
    expect(event.cardId).toBe("a");
    expect(event.grade).toBe(2);
    expect(event.clientId).toBe("client-x");
    expect(event.stateAfter).toEqual(updatedCard.scheduling);
  });
});

describe("no network in the loop", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // Any network call during grading is a failure, not a slow test.
    globalThis.fetch = vi.fn(() => {
      throw new Error("network touched during review");
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("grading and recording a review completes with fetch disabled", async () => {
    await db.clearStore("queue");
    const { updatedCard, event } = gradeCard(makeCard("net-1"), 3, "t");
    await recordReview(event, updatedCard);
    expect((await db.listReviewEvents()).some((e) => e.id === event.id)).toBe(true);
    // Queued for a later push — but only where there is something to
    // push to. The open-source edition writes no queue at all (see
    // db.enqueue); the assertion that matters either way is the one
    // below: nothing went over the network.
    if (FLAGS.HAS_SYNC) expect((await db.listQueue()).length).toBeGreaterThan(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
