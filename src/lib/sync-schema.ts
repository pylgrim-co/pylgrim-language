import { z } from "zod";
import { cardSchema, storySchema } from "./schema";

/**
 * The sync wire format, shared by the client engine and the /api/v1/sync
 * route handlers. Locally-created rows carry client UUIDs; the server
 * stamps `updated_at` (the pull cursor) and trusts `clientUpdatedAt` only
 * for last-write-wins ordering.
 */

export const FEEDBACK_CATEGORIES = [
  "translation_wrong",
  "wrong_region_register",
  "inappropriate",
  "did_not_cover",
  "too_hard_easy",
  "dull",
] as const;

export const syncStorySchema = z.object({
  story: storySchema,
  clientUpdatedAt: z.string(),
  deleted: z.boolean().optional(),
});

export const syncCardSchema = z.object({
  card: cardSchema.extend({ scheduling: z.unknown().optional() }),
  clientUpdatedAt: z.string(),
  deleted: z.boolean().optional(),
});

export const reviewEventSchema = z.object({
  id: z.string().uuid(),
  cardId: z.string(),
  grade: z.number().int().min(1).max(4),
  reviewedAt: z.string(),
  stateAfter: z.unknown(),
  clientId: z.string(),
});
export type ReviewEvent = z.infer<typeof reviewEventSchema>;

/**
 * Activity events (work item activity-events-and-mastery-fixes): the
 * append-only record of what the learner DID — reading, quizzes,
 * practice — with the difficulty or tier it happened at. Same shape
 * discipline as review events: client UUIDs, insert-only, dedupe on id.
 * Streaks, recaps and milestones all derive from this log plus review
 * events; nothing stores aggregated progress state.
 */
export const ACTIVITY_KINDS = ["story_opened", "story_finished", "quiz_completed", "practice_completed"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const activityEventSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(ACTIVITY_KINDS),
  storyId: z.string(),
  format: z.enum(["weave", "dialogue-tiers"]),
  /** weave difficulty or dialogue tier (both 1..5) the event happened at */
  difficulty: z.number().int().min(1).max(5),
  occurredAt: z.string(),
  clientId: z.string(),
  detail: z
    .object({
      /** target-language words on the page as rendered (finish events) */
      targetWords: z.number().int().min(0).optional(),
      /** quiz/practice outcomes */
      correct: z.number().int().min(0).optional(),
      total: z.number().int().min(0).optional(),
      /** flip interactions during the read — 0 means read unaided */
      flips: z.number().int().min(0).optional(),
    })
    .optional(),
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const feedbackSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().nullable(),
  verdict: z.enum(["up", "down"]),
  category: z.enum(FEEDBACK_CATEGORIES).nullable(),
  kind: z.enum(["story", "extraction"]),
  freeText: z.string().nullable(),
  createdAt: z.string(),
  clientUpdatedAt: z.string(),
});
export type FeedbackRecord = z.infer<typeof feedbackSchema>;

export const pushRequestSchema = z.object({
  stories: z.array(syncStorySchema).default([]),
  cards: z.array(syncCardSchema).default([]),
  reviewEvents: z.array(reviewEventSchema).default([]),
  feedback: z.array(feedbackSchema).default([]),
  activityEvents: z.array(activityEventSchema).default([]),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

export const pullResponseSchema = z.object({
  serverTime: z.string(),
  stories: z.array(syncStorySchema),
  cards: z.array(syncCardSchema),
  reviewEvents: z.array(reviewEventSchema),
  activityEvents: z.array(activityEventSchema).default([]),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;
