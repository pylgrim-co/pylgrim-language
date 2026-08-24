"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoryV2, DialogueLine } from "../lib/schema-v2";
import { selectTier, type V2Block } from "../lib/dialogue";
import { languageOf } from "../lib/languages";
import { saveCard } from "../lib/mutations";
import { scheduleSync } from "../edition/client";
import { playClip } from "../lib/audio-client";
import AudioButton from "./ui/AudioButton";
import AudioSettings from "./AudioSettings";
import { logActivity, tierTargetWords } from "../lib/activity";
import { nextScenario } from "../edition/client";
import type { PoolSuggestion } from "../edition/types";
import { weakObjectives } from "../lib/mastery";
import { db } from "../lib/db";

/**
 * The dialogue-tiers reading surface (Amendment A1). The tier slider
 * SELECTS a stored track — zero network, zero regeneration; the charter
 * invariants survive reinterpreted. Narrative stays English and quiet;
 * the conversation is the product.
 */

const TIER_LABELS: Record<number, string> = {
  1: "survival phrases",
  2: "simple sentences",
  3: "everyday pace",
  4: "confident",
  5: "full native speed",
};

interface Props {
  story: StoryV2;
  onSavedCard?: () => void;
  onPractise?: (tier: number) => void;
  /** open the derived quiz over the current tier's dialogue */
  onQuiz?: (tier: number) => void;
  /** the re-read moment opens at a proven-higher tier */
  initialTier?: number | null;
  /** open a suggested next scenario from the pool */
  onOpenPool?: (r: PoolSuggestion) => void;
}

export default function StoryReaderV2({ story, onSavedCard, onPractise, onQuiz, initialTier, onOpenPool }: Props) {
  const [tier, setTier] = useState(initialTier ?? 2);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [suggestion, setSuggestion] = useState<PoolSuggestion | null>(null);
  const flipsRef = useRef(0);

  const blocks: V2Block[] = useMemo(() => selectTier(story, tier), [story, tier]);
  const languageName = languageOf(story.targetLang).name;

  useEffect(() => {
    setFinished(false);
    void logActivity({ kind: "story_opened", storyId: story.id, format: "dialogue-tiers", difficulty: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  async function handleFinished() {
    setFinished(true);
    await logActivity({
      kind: "story_finished",
      storyId: story.id,
      format: "dialogue-tiers",
      difficulty: tier,
      detail: { targetWords: tierTargetWords(story, tier), flips: flipsRef.current },
    });
    setToast("Marked as read");
    setTimeout(() => setToast(null), 1800);
    // Scenario ladder: pool tags + weak objectives via the existing pool
    // search. Silent when offline — reading never waits on it.
    if (onOpenPool) {
      let weak: string[] = [];
      try {
        const [cards, events, stories, storiesV2] = await Promise.all([
          db.listCards(),
          db.listReviewEvents(),
          db.listStories(),
          db.listStoriesV2(),
        ]);
        weak = weakObjectives(cards, events, stories, storiesV2);
      } catch {
        /* suggestion still worth trying on tags alone */
      }
      setSuggestion(
        await nextScenario({
          currentPoolId: story.poolId,
          tags: story.tags,
          weak,
          targetLang: story.targetLang,
        }),
      );
    }
  }

  function say(text: string) {
    void playClip(text, story.targetLang).then((problem) => {
      if (problem) {
        setToast(problem);
        setTimeout(() => setToast(null), 2200);
      }
    });
  }

  async function save(line: DialogueLine) {
    await saveCard({
      id: crypto.randomUUID(),
      l1Text: line.l1Text,
      targetText: line.targetText,
      targetLang: story.targetLang,
      region: story.region,
      storyId: story.id,
      segmentId: line.id,
      createdAt: new Date().toISOString(),
    });
    scheduleSync();
    setToast("Saved to cards");
    onSavedCard?.();
    setTimeout(() => setToast(null), 1800);
  }

  return (
    <article className="reader reader-v2">
      <header className="reader-head">
        <h2 lang={story.targetLang}>{story.titleTarget}</h2>
        <p className="objectives">
          {story.objectives.map((o) => (
            <span key={o} className="objective-chip">
              {o}
            </span>
          ))}
        </p>
        <label className="difficulty">
          <span>
            Conversation tier {tier} — {TIER_LABELS[tier]}
          </span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={tier}
            onChange={(e) => {
              setTier(Number(e.target.value));
              setFlipped({}); // a new tier is a fresh conversation
            }}
          />
        </label>
        <div className="reader-controls">
          {onPractise && (
            <button className="practice-cta" onClick={() => onPractise(tier)}>
              🎯 Practise this conversation
            </button>
          )}
          {onQuiz && (
            <button className="practice-cta" onClick={() => onQuiz(tier)}>
              📝 Quiz this tier
            </button>
          )}
          <AudioSettings targetLang={story.targetLang} />
        </div>
      </header>

      <div className="story-body v2-body">
        {blocks.map((block, i) =>
          block.kind === "narrative" ? (
            <p key={i} className="v2-narrative">
              {block.text}
            </p>
          ) : (
            <div key={i} className="v2-exchange">
              {block.lines.map((line) => {
                const showL1 = flipped[line.id] ?? false;
                return (
                  <div key={line.id} className={`v2-line ${line.isLearner ? "learner" : "counterpart"}`}>
                    <span className="v2-speaker">{line.speaker}</span>
                    <button
                      className="v2-bubble"
                      lang={showL1 ? "en" : story.targetLang}
                      onClick={() => {
                        if (!showL1) flipsRef.current += 1; // a peek at the English
                        setFlipped((f) => ({ ...f, [line.id]: !showL1 }));
                      }}
                      title="tap to flip language"
                    >
                      {showL1 ? line.l1Text : line.targetText}
                    </button>
                    <span className="v2-line-actions">
                      <AudioButton title="hear it" onPlay={() => say(line.targetText)} />
                      <button aria-label="save as card" onClick={() => void save(line)}>
                        ➕
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ),
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <footer className="reader-foot">
        <span>
          tier {tier} of 5 · tap a line to flip it between {languageName} and English · switching
          tiers is instant — every tier is already here
        </span>
        <div className="finish-row">
          {finished ? (
            <span className="finish-done">✓ Read at tier {tier}</span>
          ) : (
            <button className="secondary" onClick={() => void handleFinished()}>
              ✓ Finished reading
            </button>
          )}
        </div>
        {suggestion && onOpenPool && (
          <div className="next-scenario">
            <span>
              Next scenario: <strong lang={suggestion.targetLang}>{suggestion.titleTarget}</strong> · {suggestion.level}
            </span>
            <button className="secondary" onClick={() => onOpenPool(suggestion)}>
              Open it
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
