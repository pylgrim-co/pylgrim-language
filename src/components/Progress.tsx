"use client";

import { useEffect, useState } from "react";
import type { Card, Story } from "../lib/schema";
import type { StoryV2 } from "../lib/schema-v2";
import type { ActivityEvent, ReviewEvent } from "../lib/sync-schema";
import { db } from "../lib/db";
import { languageOf } from "../lib/languages";
import { computeMastery } from "../lib/mastery";
import {
  canDoStatements,
  masteryDeltas,
  reReadSuggestion,
  titleIndex,
  weekRecap,
  weekStart,
  type ReReadSuggestion,
} from "../lib/progress";
import { heatmap, weeklyStreak, ACTIVE_DAYS_PER_WEEK } from "../lib/streak";
import { milestones } from "../lib/milestones";
import { Sparkle, Blob } from "./ui/Doodle";

/**
 * The progress surface (work items progress-recap-and-re-read-moment,
 * weekly-consistency-streak). Every figure renders client-side from the
 * local event logs — this panel works fully offline and never asks the
 * server to aggregate anything. Milestones and next-scenario suggestions
 * join this panel in their own work item.
 */

interface Props {
  onOpenStory: (s: Story, difficulty: number) => void;
  onOpenStoryV2: (s: StoryV2, tier: number) => void;
  onPractiseWeak: () => void;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function Progress({ onOpenStory, onOpenStoryV2, onPractiseWeak }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [reviews, setReviews] = useState<ReviewEvent[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [storiesV2, setStoriesV2] = useState<StoryV2[]>([]);

  useEffect(() => {
    (async () => {
      const [c, r, a, s, s2] = await Promise.all([
        db.listCards(),
        db.listReviewEvents(),
        db.listActivityEvents(),
        db.listStories(),
        db.listStoriesV2(),
      ]);
      setCards(c);
      setReviews(r);
      setActivity(a);
      setStories(s);
      setStoriesV2(s2);
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const now = new Date();
  const recap = weekRecap(activity, reviews, now);
  const streak = weeklyStreak(activity, reviews, now);
  const grid = heatmap(activity, reviews, 8, now);
  const titles = titleIndex(stories, storiesV2, (code) => languageOf(code).name);
  const canDo = canDoStatements(activity, titles);
  const deltas = masteryDeltas(cards, reviews, stories, storiesV2, weekStart(now)).slice(0, 5);
  const reRead = reReadSuggestion(activity);
  const weakest = computeMastery(cards, reviews, stories, storiesV2).filter((m) => m.mastery < 1)[0];
  const earned = milestones(activity, reviews, storiesV2);

  const empty = activity.length === 0 && reviews.length === 0;

  function openReRead(suggestion: ReReadSuggestion) {
    if (suggestion.format === "weave") {
      const s = stories.find((x) => x.core.id === suggestion.storyId);
      if (s) onOpenStory(s, suggestion.suggested);
    } else {
      const s = storiesV2.find((x) => x.id === suggestion.storyId);
      if (s) onOpenStoryV2(s, suggestion.suggested);
    }
  }

  const reReadStoryKnown =
    reRead &&
    (reRead.format === "weave"
      ? stories.some((s) => s.core.id === reRead.storyId)
      : storiesV2.some((s) => s.id === reRead.storyId));

  return (
    <section className="progress-panel">
      <div className="page-head">
        <Blob hue="sage" delay="300ms" style={{ right: "-2rem", top: "-2.2rem", width: "8rem", height: "8rem", opacity: 0.4 }} />
        <Sparkle hue="lilac" wiggle style={{ top: "-0.8rem", left: "11rem", width: "1.9rem", height: "1.9rem" }} />
        <h1>Progress</h1>
      </div>

      {empty && <p className="hint">Read a story, take its quiz, or review some cards — your progress shows up here.</p>}

      {!empty && (
        <>
          <div className="streak-box">
            <p className="streak-line">
              {streak.weeks > 0 ? (
                <>
                  🔥 <strong>{streak.weeks}-week streak</strong>
                </>
              ) : (
                <>Start a streak</>
              )}{" "}
              · {streak.currentWeekActiveDays} active day{streak.currentWeekActiveDays === 1 ? "" : "s"} this week
              {!streak.currentWeekQualified && (
                <span className="hint">
                  {" "}
                  — {streak.daysToQualify} more make{streak.daysToQualify === 1 ? "s" : ""} the week count ({ACTIVE_DAYS_PER_WEEK} of 7 is enough)
                </span>
              )}
            </p>
            <div className="heatmap" aria-label="activity calendar">
              {grid.map((week, wi) => (
                <div key={wi} className="heatmap-week">
                  {week.map((d) => (
                    <span key={d.day} className={`heatmap-day${d.active ? " active" : ""}`} title={d.day} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="recap-figures">
            <div className="figure">
              <span className="figure-n">{recap.targetWordsRead}</span>
              <span className="figure-label">
                words read this week{recap.previous.targetWordsRead > 0 && <> · last week {recap.previous.targetWordsRead}</>}
              </span>
            </div>
            <div className="figure">
              <span className="figure-n">{recap.storiesFinished.length}</span>
              <span className="figure-label">
                stories finished{recap.previous.storiesFinished > 0 && <> · last week {recap.previous.storiesFinished}</>}
              </span>
            </div>
            <div className="figure">
              <span className="figure-n">{recap.cardsReviewed}</span>
              <span className="figure-label">
                cards reviewed{recap.previous.cardsReviewed > 0 && <> · last week {recap.previous.cardsReviewed}</>}
              </span>
            </div>
          </div>

          {reRead && reReadStoryKnown && (
            <div className="re-read">
              <p>
                You read <strong>“{titles.titleOf(reRead.storyId) ?? "an earlier story"}”</strong> at{" "}
                {reRead.format === "dialogue-tiers" ? `tier ${reRead.readAt}` : `difficulty ${reRead.readAt}`} — and you&apos;ve
                since read at {reRead.suggested}. See how far you&apos;ve come:
              </p>
              <button className="primary" onClick={() => openReRead(reRead)}>
                Re-read it at {reRead.format === "dialogue-tiers" ? `tier ${reRead.suggested}` : `difficulty ${reRead.suggested}`}
              </button>
            </div>
          )}

          {deltas.length > 0 && (
            <div className="mastery-moves">
              <h2>Objectives this week</h2>
              <ul>
                {deltas.map((d) => (
                  <li key={d.objective}>
                    <span className="objective-chip">{d.objective}</span>
                    <span className="delta">
                      {d.before === null ? `new — ${pct(d.after)}` : `${pct(d.before)} → ${pct(d.after)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canDo.length > 0 && (
            <div className="can-do">
              <h2>What you can do now</h2>
              <ul>
                {canDo.map((c) => (
                  <li key={c.occurredAt + c.text}>{c.text}</li>
                ))}
              </ul>
            </div>
          )}

          {earned.length > 0 && (
            <div className="milestones">
              <h2>Milestones</h2>
              <ul>
                {earned.map((m) => (
                  <li key={m.id}>
                    <span className="milestone-date">{m.occurredAt.slice(0, 10)}</span> {m.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {weakest && (
            <div className="weak-point">
              <p>
                Your weakest objective right now: <span className="objective-chip">{weakest.objective}</span> ({pct(weakest.mastery)}{" "}
                across {weakest.reviews} reviews).
              </p>
              <button className="secondary" onClick={onPractiseWeak}>
                Practise my weak points
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
