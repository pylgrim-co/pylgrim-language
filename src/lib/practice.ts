import { db } from "./db";
import { gradeCard, type Grade } from "./review";
import { recordReview, saveCard } from "./mutations";
import type { Card } from "./schema";
import type { DialogueLine, StoryV2 } from "./schema-v2";

/**
 * Response practice (work item response-practice-mode): hear the other
 * party, produce your line, reveal, self-grade. Self-grades map onto FSRS
 * review grades so practice feeds the SAME retention loop as reading —
 * one scheduler, one card store, no parallel system.
 */

export type PracticeChoice = "got" | "nearly" | "missed";

export const PRACTICE_GRADE: Record<PracticeChoice, Grade> = {
  got: 3, // Good
  nearly: 2, // Hard
  missed: 1, // Again
};

/** One card per practised learner line, reused across sessions: keyed by
 *  (story, target text) so re-practising strengthens rather than duplicates. */
export async function findOrCreatePracticeCard(story: StoryV2, line: DialogueLine): Promise<Card> {
  const cards = await db.listCards();
  const existing = cards.find((c) => c.storyId === story.id && c.targetText === line.targetText);
  if (existing) return existing;
  return saveCard({
    id: crypto.randomUUID(),
    l1Text: line.l1Text,
    targetText: line.targetText,
    targetLang: story.targetLang,
    region: story.region,
    storyId: story.id,
    segmentId: line.id,
    createdAt: new Date().toISOString(),
  });
}

/** Record one practised line: grade → FSRS state + append-only review event. */
export async function recordPractice(story: StoryV2, line: DialogueLine, choice: PracticeChoice, clientId: string): Promise<void> {
  const card = await findOrCreatePracticeCard(story, line);
  const { updatedCard, event } = gradeCard(card, PRACTICE_GRADE[choice], clientId);
  await recordReview(event, updatedCard);
}
