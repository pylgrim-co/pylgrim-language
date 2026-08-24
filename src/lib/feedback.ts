import type { FeedbackRecord } from "./sync-schema";
import { FEEDBACK_CATEGORIES } from "./sync-schema";

/**
 * Feedback capture (PLAN.md §7.3). Categories differ enormously in what
 * they will trigger in P2; they are captured distinctly from day one so
 * the pool launches with signal to rank on. "Didn't cover what I asked"
 * is feedback on EXTRACTION, not the story — the only quality metric
 * stage 1 has — so it routes with kind "extraction".
 */

export const CATEGORY_LABELS: Record<(typeof FEEDBACK_CATEGORIES)[number], string> = {
  translation_wrong: "A translation is wrong",
  wrong_region_register: "Wrong region or formality",
  inappropriate: "Inappropriate content",
  did_not_cover: "Didn't cover what I asked",
  too_hard_easy: "Too hard / too easy",
  dull: "Dull — didn't enjoy it",
};

export function feedbackKind(category: FeedbackRecord["category"]): "story" | "extraction" {
  return category === "did_not_cover" ? "extraction" : "story";
}

export function makeFeedback(params: {
  storyId: string | null;
  verdict: "up" | "down";
  category?: (typeof FEEDBACK_CATEGORIES)[number] | null;
  freeText?: string;
}): FeedbackRecord {
  const category = params.category ?? null;
  return {
    id: crypto.randomUUID(),
    storyId: params.storyId,
    verdict: params.verdict,
    category,
    kind: feedbackKind(category),
    freeText: params.freeText?.trim() ? params.freeText.trim() : null,
    createdAt: new Date().toISOString(),
    clientUpdatedAt: new Date().toISOString(),
  };
}
