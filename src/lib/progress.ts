import type { Card, Story } from "./schema";
import type { StoryV2 } from "./schema-v2";
import type { ActivityEvent, ReviewEvent } from "./sync-schema";
import { computeMastery } from "./mastery";

/**
 * The progress recap (work item progress-recap-and-re-read-moment).
 * Everything here is a PURE function over the two local event logs —
 * activity events and review events — plus the stories they reference.
 * No network, no server aggregation, no stored progress state: the recap
 * is a client-side render over synced facts, exactly like the weave.
 *
 * Why it exists: paying adult learners churn when effort stops mapping
 * to visible capability. The recap's job is to make progress legible —
 * words read, mastery moved, and the re-read moment: proof you can now
 * read at a difficulty you couldn't before.
 */

/** Local calendar date (the learner's day, not UTC's). */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Start of the local week (Monday 00:00) containing `now`. */
export function weekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 Sunday
  const back = (day + 6) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

export interface StoryFinish {
  storyId: string;
  format: "weave" | "dialogue-tiers";
  difficulty: number;
  occurredAt: string;
  targetWords: number;
}

export interface QuizResult {
  storyId: string;
  format: "weave" | "dialogue-tiers";
  difficulty: number;
  correct: number;
  total: number;
  occurredAt: string;
}

export interface WeekRecap {
  weekStartsAt: string;
  targetWordsRead: number;
  storiesFinished: StoryFinish[];
  quizzes: QuizResult[];
  cardsReviewed: number;
  /** local YYYY-MM-DD dates with any learning activity */
  activeDays: string[];
  /** the same figures for the previous week — the trend */
  previous: { targetWordsRead: number; storiesFinished: number; cardsReviewed: number };
}

function finishesIn(events: ActivityEvent[], from: Date, to: Date): StoryFinish[] {
  return events
    .filter((e) => e.kind === "story_finished")
    .filter((e) => {
      const t = new Date(e.occurredAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    })
    .map((e) => ({
      storyId: e.storyId,
      format: e.format,
      difficulty: e.difficulty,
      occurredAt: e.occurredAt,
      targetWords: e.detail?.targetWords ?? 0,
    }));
}

export function weekRecap(events: ActivityEvent[], reviews: ReviewEvent[], now: Date = new Date()): WeekRecap {
  const start = weekStart(now);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const inWeek = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t < end.getTime();
  };
  const inPrev = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= prevStart.getTime() && t < start.getTime();
  };

  const finished = finishesIn(events, start, end);
  const prevFinished = finishesIn(events, prevStart, start);

  const quizzes: QuizResult[] = events
    .filter((e) => e.kind === "quiz_completed" && inWeek(e.occurredAt))
    .map((e) => ({
      storyId: e.storyId,
      format: e.format,
      difficulty: e.difficulty,
      correct: e.detail?.correct ?? 0,
      total: e.detail?.total ?? 0,
      occurredAt: e.occurredAt,
    }));

  const reviewed = reviews.filter((r) => inWeek(r.reviewedAt));
  const prevReviewed = reviews.filter((r) => inPrev(r.reviewedAt)).length;

  const activeDays = new Set<string>();
  for (const e of events) if (inWeek(e.occurredAt)) activeDays.add(dayKey(e.occurredAt));
  for (const r of reviewed) activeDays.add(dayKey(r.reviewedAt));

  return {
    weekStartsAt: start.toISOString(),
    targetWordsRead: finished.reduce((n, f) => n + f.targetWords, 0),
    storiesFinished: finished,
    quizzes,
    cardsReviewed: reviewed.length,
    activeDays: [...activeDays].sort(),
    previous: {
      targetWordsRead: prevFinished.reduce((n, f) => n + f.targetWords, 0),
      storiesFinished: prevFinished.length,
      cardsReviewed: prevReviewed,
    },
  };
}

// ---------- mastery deltas ----------

export interface MasteryDelta {
  objective: string;
  /** null when the objective had no reviews before the window */
  before: number | null;
  after: number;
  reviews: number;
}

/** How each objective's mastery moved since `since` (typically week start). */
export function masteryDeltas(
  cards: Card[],
  reviews: ReviewEvent[],
  stories: Story[],
  storiesV2: StoryV2[],
  since: Date,
): MasteryDelta[] {
  const prior = reviews.filter((r) => new Date(r.reviewedAt).getTime() < since.getTime());
  const beforeByObjective = new Map(computeMastery(cards, prior, stories, storiesV2).map((m) => [m.objective, m]));
  const after = computeMastery(cards, reviews, stories, storiesV2);
  return after
    .filter((m) => {
      const b = beforeByObjective.get(m.objective);
      return !b || b.reviews !== m.reviews; // touched this window
    })
    .map((m) => ({
      objective: m.objective,
      before: beforeByObjective.get(m.objective)?.mastery ?? null,
      after: m.mastery,
      reviews: m.reviews,
    }));
}

// ---------- can-do statements ----------

export interface CanDo {
  text: string;
  occurredAt: string;
}

const PASS_THRESHOLD = 0.8;

interface TitleSource {
  titleOf: (storyId: string) => string | null;
  langNameOf: (storyId: string) => string | null;
}

export function titleIndex(stories: Story[], storiesV2: StoryV2[], langName: (code: string) => string): TitleSource {
  const titles = new Map<string, { title: string; lang: string }>();
  for (const s of stories) titles.set(s.core.id, { title: s.rendering.title || s.core.title, lang: s.core.targetLang });
  for (const s of storiesV2) titles.set(s.id, { title: s.titleL1 || s.titleTarget, lang: s.targetLang });
  return {
    titleOf: (id) => titles.get(id)?.title ?? null,
    langNameOf: (id) => {
      const lang = titles.get(id)?.lang;
      return lang ? langName(lang) : null;
    },
  };
}

/** Earned capability statements, newest first — derived from the user's own
 *  events, never claimed. CEFR framing is deliberately absent (charter). */
export function canDoStatements(events: ActivityEvent[], titles: TitleSource, limit = 6): CanDo[] {
  const out: CanDo[] = [];
  for (const e of events) {
    const title = titles.titleOf(e.storyId);
    if (!title) continue;
    if (e.kind === "quiz_completed" && e.detail?.total && e.detail.total > 0) {
      const correct = e.detail.correct ?? 0;
      if (correct / e.detail.total >= PASS_THRESHOLD) {
        const level = e.format === "dialogue-tiers" ? `tier ${e.difficulty}` : `difficulty ${e.difficulty}`;
        out.push({
          text: `You read “${title}” at ${level} and passed its quiz (${correct}/${e.detail.total}).`,
          occurredAt: e.occurredAt,
        });
      }
    }
    if (e.kind === "story_finished" && e.difficulty === 5) {
      const lang = titles.langNameOf(e.storyId);
      out.push({
        text:
          e.format === "dialogue-tiers"
            ? `You read “${title}” at full native pace — tier 5.`
            : `You read “${title}” entirely in ${lang ?? "the target language"}.`,
        occurredAt: e.occurredAt,
      });
    }
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}

// ---------- the re-read moment ----------

export interface ReReadSuggestion {
  storyId: string;
  format: "weave" | "dialogue-tiers";
  /** the highest difficulty this story has been finished at */
  readAt: number;
  /** the higher setting the user has since proven elsewhere */
  suggested: number;
}

/**
 * The manufactured progress proof: when the user has finished any story
 * at a higher difficulty than some earlier story was ever read at,
 * offer that earlier story at the higher setting. A pure client-side
 * re-render of an owned story — the cheapest "look how far you've come"
 * the product can produce.
 */
export function reReadSuggestion(events: ActivityEvent[]): ReReadSuggestion | null {
  const finishes = events.filter((e) => e.kind === "story_finished");
  if (finishes.length === 0) return null;

  const maxByStory = new Map<string, { format: "weave" | "dialogue-tiers"; max: number; firstAt: string }>();
  let overallMax = 0;
  for (const e of finishes) {
    overallMax = Math.max(overallMax, e.difficulty);
    const cur = maxByStory.get(e.storyId);
    if (!cur) {
      maxByStory.set(e.storyId, { format: e.format, max: e.difficulty, firstAt: e.occurredAt });
    } else {
      cur.max = Math.max(cur.max, e.difficulty);
      if (e.occurredAt < cur.firstAt) cur.firstAt = e.occurredAt;
    }
  }

  // The earliest-read story with the most headroom.
  let best: ReReadSuggestion | null = null;
  let bestAt = "";
  for (const [storyId, s] of maxByStory) {
    if (s.max >= overallMax) continue;
    if (!best || s.max < best.readAt || (s.max === best.readAt && s.firstAt < bestAt)) {
      best = { storyId, format: s.format, readAt: s.max, suggested: overallMax };
      bestAt = s.firstAt;
    }
  }
  return best;
}
