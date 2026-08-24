"use client";

import { useEffect, useMemo, useState } from "react";
import { m } from "motion/react";
import type { Card } from "../lib/schema";
import { db } from "../lib/db";
import { dueCards, gradeCard, GRADE_LABELS, type Grade } from "../lib/review";
import { recordReview } from "../lib/mutations";
import { scheduleSync } from "../edition/client";
import { Sparkle, Blob } from "./ui/Doodle";
import AudioButton from "./ui/AudioButton";
import { playClip } from "../lib/audio-client";

import { getClientId } from "../lib/activity";

/**
 * The retention surface. Scheduling is computed here on the client from
 * local state — a full session works with no connection at all, and the
 * change queue reconciles when one returns.
 */

export default function Review() {
  const [cards, setCards] = useState<Card[]>([]);
  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await db.listCards();
      setCards(all);
      setQueue(dueCards(all));
      setLoaded(true);
    })();
  }, []);

  const current = queue[0] ?? null;
  const remaining = queue.length;
  const total = useMemo(() => done + remaining, [done, remaining]);

  async function handleGrade(grade: Grade) {
    if (!current) return;
    const { updatedCard, event } = gradeCard(current, grade, await getClientId());
    await recordReview(event, updatedCard);
    scheduleSync();
    setRevealed(false);
    setDone((d) => d + 1);
    // "Again" comes back at the end of this session; the rest leave it.
    setQueue((q) => (grade === 1 ? [...q.slice(1), updatedCard] : q.slice(1)));
  }

  const head = (
    <div className="page-head">
      <Blob hue="lilac" variant={2} delay="300ms" style={{ right: "10%", top: "-2rem", width: "7.5rem", height: "7.5rem", opacity: 0.38 }} />
      <Sparkle hue="ochre" wiggle style={{ top: "-0.8rem", left: "9rem", width: "1.9rem", height: "1.9rem" }} />
      <h1>Review</h1>
    </div>
  );

  if (!loaded) return null;

  if (cards.length === 0) {
    return (
      <section className="review">
        {head}
        <p className="hint">No cards yet — select a phrase in a story and save it.</p>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="review">
        {head}
        <p className="review-done">
          {done > 0 ? `Session complete — ${done} card${done === 1 ? "" : "s"} reviewed.` : "Nothing due. Come back later."}
        </p>
      </section>
    );
  }

  return (
    <section className="review">
      {head}
      <p className="hint">
        {done + 1} of {total}
      </p>
      <div className="review-card" onClick={() => setRevealed(true)}>
        <span lang={current.targetLang} className="review-target">
          {current.targetText}
        </span>
        {revealed ? (
          <>
            <span className="review-l1">{current.l1Text}</span>
            <AudioButton label="hear it" onPlay={() => playClip(current.targetText, current.targetLang)} />
          </>
        ) : (
          <span className="review-reveal">tap to reveal</span>
        )}
      </div>
      {revealed && (
        <div className="grade-row">
          {([1, 2, 3, 4] as Grade[]).map((g) => (
            <m.button key={g} className={`grade grade-${g}`} whileTap={{ scale: 0.96 }} onClick={() => handleGrade(g)}>
              {GRADE_LABELS[g]}
            </m.button>
          ))}
        </div>
      )}
    </section>
  );
}
