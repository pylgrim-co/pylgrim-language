import type { ActivityEvent, ReviewEvent } from "./sync-schema";
import type { StoryV2 } from "./schema-v2";

/**
 * Capability milestones (work item milestones-and-scenario-ladders).
 * No XP, no badges, no icon economy: each milestone is a dated FACT
 * derived from the event logs — deleting nothing, storing nothing.
 * The rules name real capability, not engagement.
 */

export interface Milestone {
  id: string;
  text: string;
  occurredAt: string;
}

const PASS_THRESHOLD = 0.8;
export const CLEAN_REVIEWS_TARGET = 100;

/** The tag App stamps on stories generated as checkpoints. */
export const CHECKPOINT_TAG = "checkpoint";

export function milestones(activity: ActivityEvent[], reviews: ReviewEvent[], storiesV2: StoryV2[]): Milestone[] {
  const out: Milestone[] = [];
  const byTime = [...activity].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  // First story finished without a single flip — read unaided.
  const zeroFlip = byTime.find((e) => e.kind === "story_finished" && e.detail?.flips === 0);
  if (zeroFlip) {
    out.push({
      id: "first-zero-flip-finish",
      text: "Finished a story without flipping a single word.",
      occurredAt: zeroFlip.occurredAt,
    });
  }

  // First read at the top of the ladder.
  const fullDifficulty = byTime.find((e) => e.kind === "story_finished" && e.difficulty === 5);
  if (fullDifficulty) {
    out.push({
      id: "first-difficulty-5",
      text:
        fullDifficulty.format === "dialogue-tiers"
          ? "Read a conversation at tier 5 — full native pace."
          : "Read a story at difficulty 5 — no English on the page.",
      occurredAt: fullDifficulty.occurredAt,
    });
  }

  // First checkpoint passed: a passed quiz over a checkpoint-tagged story.
  const checkpointIds = new Set(storiesV2.filter((s) => s.tags.includes(CHECKPOINT_TAG)).map((s) => s.id));
  const checkpointPass = byTime.find(
    (e) =>
      e.kind === "quiz_completed" &&
      checkpointIds.has(e.storyId) &&
      (e.detail?.total ?? 0) > 0 &&
      (e.detail?.correct ?? 0) / e.detail!.total! >= PASS_THRESHOLD,
  );
  if (checkpointPass) {
    out.push({
      id: "first-checkpoint-passed",
      text: "Passed a checkpoint — objectives from several stories, tested together.",
      occurredAt: checkpointPass.occurredAt,
    });
  }

  // The hundredth clean review (Good or Easy), dated when it happened.
  const clean = reviews
    .filter((r) => r.grade >= 3)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  if (clean.length >= CLEAN_REVIEWS_TARGET) {
    out.push({
      id: "hundred-clean-reviews",
      text: `${CLEAN_REVIEWS_TARGET} reviews answered without a lapse.`,
      occurredAt: clean[CLEAN_REVIEWS_TARGET - 1].reviewedAt,
    });
  }

  return out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
