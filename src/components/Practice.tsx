"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoryV2, DialogueLine } from "../lib/schema-v2";
import { selectTier, type V2Block } from "../lib/dialogue";
import { recordPractice, type PracticeChoice } from "../lib/practice";
import { scheduleSync } from "../edition/client";
import { playClip } from "../lib/audio-client";
import AudioButton from "./ui/AudioButton";
import { getClientId, logActivity } from "../lib/activity";

/**
 * Response practice: the surface the narrowed goal demands. The other
 * party speaks (text + audio); your lines show only the English prompt
 * until you commit to an attempt; reveal, self-grade, and the grade
 * flows into the SAME FSRS loop as review. Offline-safe: audio degrades
 * with a message, the walk itself is pure local state.
 */

interface Props {
  story: StoryV2;
  tier: number;
  onClose: () => void;
  onTierUp?: (tier: number) => void;
}

interface Step {
  block: number;
  line: DialogueLine;
}

export default function Practice({ story, tier, onClose, onTierUp }: Props) {
  const blocks: V2Block[] = useMemo(() => selectTier(story, tier), [story, tier]);
  const steps: Step[] = useMemo(
    () =>
      blocks.flatMap((b, bi) => (b.kind === "exchange" ? b.lines.map((line) => ({ block: bi, line })) : [])),
    [blocks],
  );

  const [position, setPosition] = useState(0); // steps revealed so far
  const [revealed, setRevealed] = useState(false); // current learner line revealed?
  const [results, setResults] = useState<PracticeChoice[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-advance past counterpart lines; stop on learner lines.
  const current = steps[position];
  const done = position >= steps.length;
  const learnerTotal = steps.filter((s) => s.line.isLearner).length;

  // Completing the walk is an activity event (once per run).
  const loggedDone = useRef(false);
  useEffect(() => {
    if (!done || loggedDone.current) return;
    loggedDone.current = true;
    void logActivity({
      kind: "practice_completed",
      storyId: story.id,
      format: "dialogue-tiers",
      difficulty: tier,
      detail: { correct: results.filter((r) => r === "got").length, total: learnerTotal },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  function say(text: string) {
    void playClip(text, story.targetLang).then((problem) => {
      if (problem) {
        setToast(problem);
        setTimeout(() => setToast(null), 2200);
      }
    });
  }

  async function grade(choice: PracticeChoice) {
    if (!current) return;
    await recordPractice(story, current.line, choice, await getClientId());
    scheduleSync();
    setResults((r) => [...r, choice]);
    setRevealed(false);
    setPosition((p) => p + 1);
  }

  if (done) {
    const got = results.filter((r) => r === "got").length;
    return (
      <section className="practice">
        <h1>Conversation complete</h1>
        <p className="practice-summary">
          {got} of {learnerTotal} lines came out right first time.
        </p>
        <div className="row">
          <button onClick={onClose}>Back to the story</button>
          {tier < 5 && onTierUp && (
            <button className="primary" onClick={() => onTierUp(tier + 1)}>
              Try tier {tier + 1} — the conversation deepens
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="practice">
      <h1>
        Practise — tier {tier}
        <button className="linkish practice-exit" onClick={onClose}>
          exit
        </button>
      </h1>

      <div className="practice-transcript">
        {steps.slice(0, position).map((s, i) => (
          <div key={i} className={`v2-line ${s.line.isLearner ? "learner" : "counterpart"}`}>
            <span className="v2-speaker">{s.line.speaker}</span>
            <span className="v2-bubble past" lang={story.targetLang}>
              {s.line.targetText}
            </span>
            <AudioButton title="hear it" onPlay={() => say(s.line.targetText)} />
          </div>
        ))}
      </div>

      {current && !current.line.isLearner && (
        <div className="practice-current">
          <div className="v2-line counterpart">
            <span className="v2-speaker">{current.line.speaker}</span>
            <span className="v2-bubble" lang={story.targetLang}>
              {current.line.targetText}
            </span>
            <AudioButton title="hear it" onPlay={() => say(current.line.targetText)} />
          </div>
          <button
            className="primary"
            onClick={() => {
              setPosition((p) => p + 1);
            }}
          >
            Continue
          </button>
        </div>
      )}

      {current && current.line.isLearner && (
        <div className="practice-current your-turn">
          <p className="practice-prompt">
            <strong>Your turn.</strong> Say it out loud:
          </p>
          <p className="practice-l1">“{current.line.l1Text}”</p>
          {!revealed ? (
            <button className="primary" onClick={() => setRevealed(true)}>
              Reveal
            </button>
          ) : (
            <>
              <p className="practice-answer" lang={story.targetLang}>
                {current.line.targetText}{" "}
                <AudioButton title="hear it" onPlay={() => say(current.line.targetText)} />
              </p>
              <div className="grade-row">
                <button className="grade grade-4" onClick={() => void grade("got")}>
                  Got it
                </button>
                <button className="grade" onClick={() => void grade("nearly")}>
                  Nearly
                </button>
                <button className="grade grade-1" onClick={() => void grade("missed")}>
                  Missed
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}
