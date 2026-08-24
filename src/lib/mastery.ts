import type { Card, Story } from "./schema";
import type { StoryV2, DialogueLine } from "./schema-v2";
import type { ReviewEvent } from "./sync-schema";

/**
 * Objective mastery (IMPLEMENTATION.md 4.9), computed CLIENT-SIDE from
 * local review events — the server is never in the retention loop.
 * A card's lapses (Again/Hard) flow back to the objectives of the story
 * it was saved from; "practise my weak points" turns the weakest
 * objectives into a generation request with no typed intent.
 *
 * Attribution rules (work item activity-events-and-mastery-fixes):
 * - v1 weave cards credit every objective of their story — v1 spans carry
 *   no objective identity, so the story is the finest grain available.
 * - v2 dialogue cards credit the SPECIFIC objective when the saved line
 *   carries an objectiveIndex; otherwise the whole story's objectives.
 * - Cards whose storyId resolves to no known story — quick-translate
 *   cards, whose synthetic story is never saved — are excluded BY RULE:
 *   they exercise vocabulary, not a stated objective, and must never
 *   steer "practise my weak points".
 */

export interface ObjectiveMastery {
  objective: string;
  reviews: number;
  lapses: number;
  /** 0 (struggling) .. 1 (solid); undefined-reviews objectives excluded */
  mastery: number;
}

function findLine(story: StoryV2, lineId: string): DialogueLine | null {
  for (const tier of story.tiers) {
    for (const slot of tier.slots) {
      for (const line of slot) {
        if (line.id === lineId) return line;
      }
    }
  }
  return null;
}

/** The objectives a review of this card gives evidence about, or null when
 *  the card is unattributable (excluded by rule, never silently). */
export function cardObjectives(card: Card, storyById: Map<string, Story>, storyV2ById: Map<string, StoryV2>): string[] | null {
  const v1 = storyById.get(card.storyId);
  if (v1) return v1.core.objectives;
  const v2 = storyV2ById.get(card.storyId);
  if (v2) {
    const line = findLine(v2, card.segmentId);
    if (line && line.objectiveIndex !== null && v2.objectives[line.objectiveIndex] !== undefined) {
      return [v2.objectives[line.objectiveIndex]];
    }
    return v2.objectives;
  }
  return null;
}

export function computeMastery(
  cards: Card[],
  events: ReviewEvent[],
  stories: Story[],
  storiesV2: StoryV2[] = [],
): ObjectiveMastery[] {
  const storyById = new Map(stories.map((s) => [s.core.id, s]));
  const storyV2ById = new Map(storiesV2.map((s) => [s.id, s]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const byObjective = new Map<string, { reviews: number; lapses: number }>();
  for (const event of events) {
    const card = cardById.get(event.cardId);
    if (!card) continue;
    const objectives = cardObjectives(card, storyById, storyV2ById);
    if (objectives === null) continue; // unattributable — excluded by rule
    for (const objective of objectives) {
      const stat = byObjective.get(objective) ?? { reviews: 0, lapses: 0 };
      stat.reviews += 1;
      if (event.grade <= 2) stat.lapses += 1;
      byObjective.set(objective, stat);
    }
  }

  return [...byObjective.entries()]
    .map(([objective, s]) => ({
      objective,
      reviews: s.reviews,
      lapses: s.lapses,
      mastery: 1 - s.lapses / s.reviews,
    }))
    .sort((a, b) => a.mastery - b.mastery || b.reviews - a.reviews);
}

/** The weakest objectives worth practising: reviewed, imperfect, worst first. */
export function weakObjectives(
  cards: Card[],
  events: ReviewEvent[],
  stories: Story[],
  storiesV2: StoryV2[] = [],
  limit = 3,
): string[] {
  return computeMastery(cards, events, stories, storiesV2)
    .filter((m) => m.mastery < 1)
    .slice(0, limit)
    .map((m) => m.objective);
}
