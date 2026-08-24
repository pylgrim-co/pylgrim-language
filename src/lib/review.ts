import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade as FsrsGrade } from "ts-fsrs";
import type { Card } from "./schema";
import type { ReviewEvent } from "./sync-schema";

/**
 * The review engine. FSRS with DEFAULT parameters via ts-fsrs (charter:
 * a maintained implementation, no tuning). Scheduling computes on the
 * CLIENT against locally held state — this module makes no network call
 * and holds no async I/O; the server stores history for sync, never
 * decides what to show next.
 */

const scheduler = fsrs(); // default generatorParameters — deliberately untouched

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

const RATING: Record<Grade, FsrsGrade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

export const GRADE_LABELS: Record<Grade, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

/**
 * Scheduling state persists as JSON (IndexedDB + jsonb), so Date fields
 * round-trip as ISO strings. Revive before handing to ts-fsrs.
 */
export function reviveScheduling(raw: unknown): FsrsCard | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.due !== "string" && !(s.due instanceof Date)) return null;
  return {
    ...(s as unknown as FsrsCard),
    due: new Date(s.due as string),
    last_review: s.last_review ? new Date(s.last_review as string) : undefined,
  };
}

function schedulingOf(card: Card, now: Date): FsrsCard {
  return reviveScheduling(card.scheduling) ?? createEmptyCard(now);
}

/** Cards due now: never-reviewed cards are due immediately. */
export function dueCards(cards: Card[], now: Date = new Date()): Card[] {
  return cards
    .filter((c) => {
      const s = reviveScheduling(c.scheduling);
      return !s || s.due.getTime() <= now.getTime();
    })
    .sort((a, b) => {
      const da = reviveScheduling(a.scheduling)?.due.getTime() ?? 0;
      const db = reviveScheduling(b.scheduling)?.due.getTime() ?? 0;
      return da - db;
    });
}

export interface GradeResult {
  updatedCard: Card;
  event: ReviewEvent;
}

/** Pure: (card, grade, now) → new scheduling state + an append-only event. */
export function gradeCard(card: Card, grade: Grade, clientId: string, now: Date = new Date()): GradeResult {
  const current = schedulingOf(card, now);
  const { card: next } = scheduler.next(current, now, RATING[grade]);
  const scheduling = JSON.parse(JSON.stringify(next)) as unknown; // ISO-serialised form
  return {
    updatedCard: { ...card, scheduling },
    event: {
      id: crypto.randomUUID(),
      cardId: card.id,
      grade,
      reviewedAt: now.toISOString(),
      stateAfter: scheduling,
      clientId,
    },
  };
}
