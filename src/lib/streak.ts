import type { ActivityEvent, ReviewEvent } from "./sync-schema";
import { dayKey, weekStart } from "./progress";

/**
 * The weekly consistency streak (work item weekly-consistency-streak).
 *
 * A week counts when it contains at least 3 distinct active days — any
 * review, quiz, practice, or story-finish event. Adults who pause and
 * return are the learners who stay; the streak models resilience, not
 * unbroken daily perfection.
 *
 * DERIVED, NEVER STORED: this module is a pure function over the two
 * synced event logs. A fresh device recomputes the identical streak from
 * pulled events; nothing lives in the meta store. There is no repair, no
 * freeze inventory, and nothing to sell — a missed week simply resets
 * the count.
 */

export const ACTIVE_DAYS_PER_WEEK = 3;

/** Kinds that count as learning activity. Merely opening a story does not. */
const COUNTED_KINDS = new Set(["story_finished", "quiz_completed", "practice_completed"]);

/** Distinct local calendar days with any counted activity. */
export function activeDayKeys(activity: ActivityEvent[], reviews: ReviewEvent[]): Set<string> {
  const days = new Set<string>();
  for (const e of activity) if (COUNTED_KINDS.has(e.kind)) days.add(dayKey(e.occurredAt));
  for (const r of reviews) days.add(dayKey(r.reviewedAt));
  return days;
}

export interface StreakState {
  /** consecutive qualifying weeks, counting the current week when it has
   *  already qualified */
  weeks: number;
  /** distinct active days so far in the current week */
  currentWeekActiveDays: number;
  /** the current week has already hit the threshold */
  currentWeekQualified: boolean;
  /** how many more active days this week would keep the streak alive */
  daysToQualify: number;
}

function mondayKey(d: Date): string {
  return dayKey(weekStart(d).toISOString());
}

export function weeklyStreak(activity: ActivityEvent[], reviews: ReviewEvent[], now: Date = new Date()): StreakState {
  const days = activeDayKeys(activity, reviews);

  // Distinct active days per week, keyed by the week's Monday.
  const perWeek = new Map<string, number>();
  for (const day of days) {
    const wk = mondayKey(new Date(`${day}T12:00:00`));
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
  }

  const currentMonday = weekStart(now);
  const currentKey = dayKey(currentMonday.toISOString());
  const currentDays = perWeek.get(currentKey) ?? 0;
  const currentQualified = currentDays >= ACTIVE_DAYS_PER_WEEK;

  // Walk back from the previous week counting consecutive qualifiers; an
  // in-progress current week never breaks the streak.
  let weeks = currentQualified ? 1 : 0;
  const cursor = new Date(currentMonday);
  for (;;) {
    cursor.setDate(cursor.getDate() - 7);
    const key = dayKey(cursor.toISOString());
    if ((perWeek.get(key) ?? 0) >= ACTIVE_DAYS_PER_WEEK) weeks++;
    else break;
  }

  return {
    weeks,
    currentWeekActiveDays: currentDays,
    currentWeekQualified: currentQualified,
    daysToQualify: Math.max(0, ACTIVE_DAYS_PER_WEEK - currentDays),
  };
}

export interface HeatmapDay {
  day: string; // local YYYY-MM-DD
  active: boolean;
}

/** The last `weeksBack` full weeks plus the current one, oldest first —
 *  rendered as the calendar heatmap from the SAME derivation. */
export function heatmap(activity: ActivityEvent[], reviews: ReviewEvent[], weeksBack = 8, now: Date = new Date()): HeatmapDay[][] {
  const days = activeDayKeys(activity, reviews);
  const start = weekStart(now);
  start.setDate(start.getDate() - 7 * weeksBack);
  const out: HeatmapDay[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w <= weeksBack; w++) {
    const week: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor.toISOString());
      week.push({ day: key, active: days.has(key) });
      cursor.setDate(cursor.getDate() + 1);
    }
    out.push(week);
  }
  return out;
}
