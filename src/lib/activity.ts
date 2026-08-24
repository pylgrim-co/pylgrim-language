import { db } from "./db";
import { recordActivity } from "./mutations";
import { scheduleSync } from "../edition/client";
import type { ActivityEvent, ActivityKind } from "./sync-schema";
import type { RenderedStory } from "./weave";
import type { StoryV2 } from "./schema-v2";
import { selectTier } from "./dialogue";

/**
 * Activity logging (work item activity-events-and-mastery-fixes).
 * Reading previously left no trace; this module gives open/finish/quiz/
 * practice moments an append-only, synced record. Everything progress-
 * shaped (streaks, recaps, milestones) derives from this log — no
 * feature stores aggregated state anywhere.
 */

/** The stable per-device id, shared with review/practice event recording. */
export async function getClientId(): Promise<string> {
  const existing = await db.getMeta<string>("clientId");
  if (existing) return existing.value;
  const id = crypto.randomUUID();
  await db.setMeta("clientId", id);
  return id;
}

export interface ActivityInput {
  kind: ActivityKind;
  storyId: string;
  format: "weave" | "dialogue-tiers";
  difficulty: number;
  detail?: ActivityEvent["detail"];
}

// React StrictMode double-mounts effects in dev; a short same-event window
// keeps dev data honest without suppressing legitimate re-opens.
let lastKey = "";
let lastAt = 0;

export async function logActivity(input: ActivityInput): Promise<ActivityEvent | null> {
  const key = `${input.kind}:${input.storyId}:${input.difficulty}`;
  const at = Date.now();
  if (key === lastKey && at - lastAt < 500) return null;
  lastKey = key;
  lastAt = at;

  const event: ActivityEvent = {
    id: crypto.randomUUID(),
    kind: input.kind,
    storyId: input.storyId,
    format: input.format,
    difficulty: clampTier(input.difficulty),
    occurredAt: new Date().toISOString(),
    clientId: await getClientId(),
    detail: input.detail,
  };
  await recordActivity(event);
  scheduleSync();
  return event;
}

function clampTier(d: number): number {
  return Math.min(5, Math.max(1, Math.round(d)));
}

/** Target-language words actually on the page for a weave render. */
export function countTargetWords(rendered: RenderedStory, targetLang: string): number {
  let words = 0;
  for (const para of rendered.paragraphs) {
    for (const seg of para) {
      for (const chunk of seg) {
        if (chunk.lang !== targetLang) continue;
        const t = chunk.text.trim();
        if (t) words += t.split(/\s+/).length;
      }
    }
  }
  return words;
}

/** Target-language words in a dialogue tier (the narrative stays English). */
export function tierTargetWords(story: StoryV2, tier: number): number {
  let words = 0;
  for (const block of selectTier(story, tier)) {
    if (block.kind !== "exchange") continue;
    for (const line of block.lines) {
      const t = line.targetText.trim();
      if (t) words += t.split(/\s+/).length;
    }
  }
  return words;
}
