import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { weeklyStreak, heatmap, activeDayKeys, ACTIVE_DAYS_PER_WEEK } from "../src/lib/streak";
import type { ActivityEvent, ReviewEvent } from "../src/lib/sync-schema";

/**
 * Work-item criteria (weekly-consistency-streak): a pure function over
 * the event logs — a week counts at 3+ distinct active days; nothing is
 * stored; a fresh device recomputes the identical streak; a missed week
 * resets with no repair surface anywhere.
 */

// Saturday; its week is Mon 17 Aug 2026 .. Sun 23 Aug.
const NOW = new Date(2026, 7, 22, 12, 0, 0);

let n = 0;
function finish(year: number, month: number, day: number): ActivityEvent {
  return {
    id: `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`,
    kind: "story_finished",
    storyId: "s",
    format: "weave",
    difficulty: 2,
    occurredAt: new Date(year, month, day, 10).toISOString(),
    clientId: "t",
  };
}

function reviewOn(year: number, month: number, day: number): ReviewEvent {
  return {
    id: crypto.randomUUID(),
    cardId: "c",
    grade: 3,
    reviewedAt: new Date(year, month, day, 20).toISOString(),
    stateAfter: {},
    clientId: "t",
  };
}

function opened(year: number, month: number, day: number): ActivityEvent {
  return { ...finish(year, month, day), kind: "story_opened", id: crypto.randomUUID() };
}

describe("weekly consistency", () => {
  it("a week counts at 3 distinct active days; mixed event types count", () => {
    // Week of 10-16 Aug: finish Mon, review Wed, finish Fri = 3 days.
    const activity = [finish(2026, 7, 10), finish(2026, 7, 14)];
    const reviews = [reviewOn(2026, 7, 12)];
    const s = weeklyStreak(activity, reviews, NOW);
    expect(s.weeks).toBe(1);
    expect(s.currentWeekQualified).toBe(false);
    expect(s.daysToQualify).toBe(ACTIVE_DAYS_PER_WEEK);
  });

  it("two active days do not qualify; multiple events one day count once", () => {
    const activity = [finish(2026, 7, 10), finish(2026, 7, 10), finish(2026, 7, 11)];
    const s = weeklyStreak(activity, [], NOW);
    expect(s.weeks).toBe(0);
  });

  it("consecutive qualifying weeks accumulate; the in-progress week joins once qualified", () => {
    const activity = [
      // week of 3-9 Aug
      finish(2026, 7, 3), finish(2026, 7, 5), finish(2026, 7, 7),
      // week of 10-16 Aug
      finish(2026, 7, 10), finish(2026, 7, 12), finish(2026, 7, 14),
      // current week: two days so far
      finish(2026, 7, 17), finish(2026, 7, 19),
    ];
    const before = weeklyStreak(activity, [], NOW);
    expect(before.weeks).toBe(2); // in-progress week doesn't break OR count yet
    expect(before.daysToQualify).toBe(1);

    const after = weeklyStreak([...activity, finish(2026, 7, 21)], [], NOW);
    expect(after.weeks).toBe(3);
    expect(after.currentWeekQualified).toBe(true);
  });

  it("a missed week resets the count — no repair, just a reset", () => {
    const activity = [
      // week of 27 Jul - 2 Aug qualified
      finish(2026, 6, 27), finish(2026, 6, 29), finish(2026, 6, 31),
      // week of 3-9 Aug: silence
      // week of 10-16 Aug qualified
      finish(2026, 7, 10), finish(2026, 7, 12), finish(2026, 7, 14),
    ];
    expect(weeklyStreak(activity, [], NOW).weeks).toBe(1); // only the latest week counts
  });

  it("merely opening a story is not activity", () => {
    const activity = [opened(2026, 7, 10), opened(2026, 7, 11), opened(2026, 7, 12)];
    expect(weeklyStreak(activity, [], NOW).weeks).toBe(0);
    expect(activeDayKeys(activity, []).size).toBe(0);
  });
});

describe("derived, never stored", () => {
  it("a fresh device recomputes the identical streak from pulled events, any order", () => {
    const activity = [
      finish(2026, 7, 10), finish(2026, 7, 12), finish(2026, 7, 14),
      finish(2026, 7, 17), finish(2026, 7, 18), finish(2026, 7, 19),
    ];
    const reviews = [reviewOn(2026, 7, 11)];
    const original = weeklyStreak(activity, reviews, NOW);
    // Simulate sync to a new device: JSON round-trip, shuffled order.
    const pulledActivity = (JSON.parse(JSON.stringify(activity)) as ActivityEvent[]).reverse();
    const pulledReviews = JSON.parse(JSON.stringify(reviews)) as ReviewEvent[];
    expect(weeklyStreak(pulledActivity, pulledReviews, NOW)).toEqual(original);
  });

  it("the streak module holds no persistence: no db import, no meta store", () => {
    const source = readFileSync(join(__dirname, "..", "src", "lib", "streak.ts"), "utf8");
    expect(source).not.toMatch(/from ["']\.\/db["']/);
    expect(source).not.toMatch(/setMeta|localStorage|indexedDB/);
  });

  it("no repair or streak-purchase surface exists anywhere in the app", () => {
    for (const file of ["src/components/Progress.tsx", "src/lib/streak.ts"]) {
      const source = readFileSync(join(__dirname, "..", file), "utf8");
      // No offer to repair, restore, or buy back a streak — the module's
      // own "there is no repair" documentation is the one allowed mention.
      expect(source.toLowerCase()).not.toMatch(/repair your|restore your|buy back|streak freeze|streak sav/);
      expect(source).not.toMatch(/gems|purchase|checkout/i);
    }
  });
});

describe("heatmap", () => {
  it("renders active days from the same derivation, oldest week first", () => {
    const activity = [finish(2026, 7, 18)];
    const reviews = [reviewOn(2026, 7, 12)];
    const grid = heatmap(activity, reviews, 2, NOW);
    expect(grid).toHaveLength(3); // 2 back + current
    const flat = grid.flat();
    expect(flat.filter((d) => d.active).map((d) => d.day)).toEqual(["2026-08-12", "2026-08-18"]);
    expect(flat[0].day < flat[flat.length - 1].day).toBe(true);
  });
});
