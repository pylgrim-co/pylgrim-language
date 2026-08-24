"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { slabSpring } from "./motion/primitives";
import type { Story } from "../lib/schema";
import { weave, type Difficulty, type Overrides, type RenderedChunk } from "../lib/weave";
import { flippableFromChunk, flipSelection, selectionSides, toggleFlip, type Flippable } from "../lib/flip";
import { recordFeedback, saveCard } from "../lib/mutations";
import { scheduleSync } from "../edition/client";
import { CATEGORY_LABELS, makeFeedback } from "../lib/feedback";
import { languageOf } from "../lib/languages";
import { playClip as playClipRequest, CLIP_MAX_CHARS } from "../lib/audio-client";
import { getAudioPrefs, type AudioPrefs } from "../lib/audio-prefs";
import { logActivity, countTargetWords } from "../lib/activity";
import { nextScenario, reportPoolFeedback } from "../edition/client";
import type { PoolSuggestion } from "../edition/types";
import { weakObjectives } from "../lib/mastery";
import { db } from "../lib/db";
import AudioSettings from "./AudioSettings";
import AudioButton from "./ui/AudioButton";
import { FEEDBACK_CATEGORIES } from "../lib/sync-schema";

/**
 * The reading surface. Difficulty is a pure client-side re-render — moving
 * the slider makes no network call, by charter and by test.
 */

function difficultyLabel(d: Difficulty, languageName: string): string {
  const labels: Record<Difficulty, string> = {
    1: "mostly English",
    2: "gentle",
    3: "half and half",
    4: `mostly ${languageName}`,
    5: `all ${languageName}`,
  };
  return labels[d];
}

interface Props {
  story: Story;
  onSavedCard?: () => void;
  /** quick-translate mode: no difficulty slider, no objectives, no feedback */
  mini?: boolean;
  /** offered after a thumbs-down on a pool story: request a fixed variant */
  onRegenerate?: (category: string, freeText: string) => void;
  /** open the derived quiz at the current difficulty */
  onQuiz?: (difficulty: number) => void;
  /** the re-read moment opens at a proven-higher difficulty */
  initialDifficulty?: number | null;
  /** open a suggested next scenario from the pool */
  onOpenPool?: (r: PoolSuggestion) => void;
}

export default function StoryReader({ story, onSavedCard, mini = false, onRegenerate, onQuiz, initialDifficulty, onOpenPool }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>(mini ? 5 : ((initialDifficulty ?? 2) as Difficulty));
  const [overrides, setOverrides] = useState<Overrides>({});
  const [toast, setToast] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ chunks: RenderedChunk[]; flippables: Flippable[] } | null>(null);
  const [verdict, setVerdict] = useState<"up" | "down" | null>(null);
  const [downCategory, setDownCategory] = useState<(typeof FEEDBACK_CATEGORIES)[number] | null>(null);
  const [downText, setDownText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [suggestion, setSuggestion] = useState<PoolSuggestion | null>(null);
  const flipsRef = useRef(0);
  const narrationRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const rendered = useMemo(() => weave(story, difficulty, overrides), [story, difficulty, overrides]);
  const languageName = languageOf(story.core.targetLang).name;

  // Opening a story is an activity event; quick-translate minis are not
  // "reading a story" and stay untracked.
  useEffect(() => {
    if (mini) return;
    setFinished(false);
    void logActivity({ kind: "story_opened", storyId: story.core.id, format: "weave", difficulty: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.core.id, mini]);

  async function handleFinished() {
    setFinished(true);
    await logActivity({
      kind: "story_finished",
      storyId: story.core.id,
      format: "weave",
      difficulty,
      detail: { targetWords: countTargetWords(rendered, story.core.targetLang), flips: flipsRef.current },
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
          tags: [],
          weak,
          targetLang: story.core.targetLang,
        }),
      );
    }
  }

  // Flat chunk list so selection can be resolved by element index.
  const flat = useMemo(() => {
    const out: RenderedChunk[] = [];
    for (const para of rendered.paragraphs) for (const seg of para) for (const c of seg) out.push(c);
    return out;
  }, [rendered]);

  function handleChunkClick(chunk: RenderedChunk) {
    // A live text selection takes precedence over a tap.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const f = flippableFromChunk(chunk, story.core.targetLang);
    if (!f) return;
    flipsRef.current += 1;
    setOverrides((prev) => toggleFlip(prev, f));
  }

  function resolveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const root = containerRef.current;
    if (!root || !root.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const nodes = root.querySelectorAll<HTMLElement>("[data-chunk]");
    const chunks: RenderedChunk[] = [];
    nodes.forEach((el) => {
      if (range.intersectsNode(el)) {
        const idx = Number(el.dataset.chunk);
        if (!Number.isNaN(idx) && flat[idx]) chunks.push(flat[idx]);
      }
    });
    if (chunks.length === 0) {
      setSelection(null);
      return;
    }
    const flippables = chunks
      .map((c) => flippableFromChunk(c, story.core.targetLang))
      .filter((f): f is Flippable => f !== null);
    setSelection({ chunks, flippables });
  }

  function handleFlipSelection() {
    if (!selection) return;
    flipsRef.current += 1;
    setOverrides((prev) => flipSelection(prev, selection.flippables, story.core.targetLang));
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  async function handleSaveCard() {
    if (!selection) return;
    const sides = selectionSides(selection.chunks, story.core.targetLang);
    if (!sides.l1 || !sides.target) {
      setToast("Nothing alignable in that selection");
      setSelection(null);
      return;
    }
    await saveCard({
      id: crypto.randomUUID(),
      l1Text: sides.l1,
      targetText: sides.target,
      targetLang: story.core.targetLang,
      region: story.core.region,
      storyId: story.core.id,
      segmentId: selection.chunks[0].segmentId,
      createdAt: new Date().toISOString(),
    });
    scheduleSync();
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setToast("Saved to cards");
    onSavedCard?.();
    setTimeout(() => setToast(null), 1800);
  }

  async function playClip(text: string) {
    const problem = await playClipRequest(text, story.core.targetLang);
    if (problem) {
      setToast(problem);
      setTimeout(() => setToast(null), 2200);
    }
  }

  async function handleNarration() {
    if (narrationUrl) return;
    setNarrationBusy(true);
    try {
      // Full target-language narration from the CORE — the weave never
      // reaches audio (charter: audio-is-never-a-woven-track).
      const prefs = await getAudioPrefs(story.core.targetLang);
      const res = await fetch("/api/v1/tts/narration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cacheKey: (story.poolId && story.poolId !== "contributed" ? story.poolId : story.core.id).replace(/[^A-Za-z0-9_-]/g, "-"),
          targetLang: story.core.targetLang,
          voice: prefs.voice,
          segments: story.core.segments,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setToast(data.message ?? "narration unavailable");
        setTimeout(() => setToast(null), 2600);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      setNarrationUrl(url);
    } catch {
      setToast("narration unavailable");
      setTimeout(() => setToast(null), 2600);
    } finally {
      setNarrationBusy(false);
    }
  }

  async function submitFeedback(v: "up" | "down") {
    const record = makeFeedback({
      storyId: story.core.id,
      verdict: v,
      category: v === "down" ? downCategory : null,
      freeText: v === "down" ? downText : undefined,
    });
    await recordFeedback(record);
    scheduleSync();
    // A pooled story's rating also feeds the shared rating and
    // moderation flow, where one exists.
    if (story.poolId) {
      reportPoolFeedback({
        poolId: story.poolId,
        verdict: v,
        category: v === "down" ? downCategory : null,
        freeText: v === "down" && downText.trim() ? downText.trim() : null,
      });
    }
    setFeedbackSent(true);
  }

  let chunkIndex = -1;

  return (
    <article className="reader">
      <header className="reader-head">
        <h2 lang={story.core.targetLang}>{story.core.title}</h2>
        {!mini && (
          <p className="objectives">
            {story.core.objectives.map((o) => (
              <span key={o} className="objective-chip">
                {o}
              </span>
            ))}
          </p>
        )}
        {mini && (() => {
          const fullTarget = story.core.segments.map((s) => s.targetText.trim()).join(" ");
          return fullTarget.length <= CLIP_MAX_CHARS ? (
            <div className="narration">
              <AudioButton label="Listen" onPlay={() => playClip(fullTarget)} />
            </div>
          ) : null;
        })()}
        {!mini && (
          <AudioSettings
            targetLang={story.core.targetLang}
            onChange={(prefs: AudioPrefs) => {
              // Speed applies to the live player instantly; a voice change
              // means different audio, so the player resets for a re-fetch.
              if (narrationRef.current) narrationRef.current.playbackRate = prefs.rate;
              setNarrationUrl(null);
            }}
          />
        )}
        {!mini && (
          <div className="narration">
            {narrationUrl ? (
              <audio
                controls
                src={narrationUrl}
                className="narration-player"
                ref={narrationRef}
                onLoadedMetadata={() => {
                  void getAudioPrefs(story.core.targetLang).then((prefs) => {
                    if (narrationRef.current) narrationRef.current.playbackRate = prefs.rate;
                  });
                }}
              />
            ) : (
              <AudioButton
                label={narrationBusy ? "Preparing narration…" : `Listen in ${languageName}`}
                onPlay={handleNarration}
              />
            )}
          </div>
        )}
        {!mini && (
          <label className="difficulty">
            <span>
              Difficulty {difficulty} — {difficultyLabel(difficulty, languageName)}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={difficulty}
              onChange={(e) => {
                setDifficulty(Number(e.target.value) as Difficulty);
                setOverrides({}); // a new level is a fresh weave
              }}
            />
          </label>
        )}
      </header>

      <div
        ref={containerRef}
        key={difficulty}
        className="story-body"
        onMouseUp={resolveSelection}
        onTouchEnd={resolveSelection}
      >
        {rendered.paragraphs.map((para, pi) => (
          <p key={pi}>
            {para.map((seg, si) => (
              <span key={si} className="segment">
                {seg.map((chunk) => {
                  chunkIndex++;
                  const idx = chunkIndex;
                  const isTarget = chunk.lang === story.core.targetLang;
                  return (
                    <span
                      key={idx}
                      data-chunk={idx}
                      lang={chunk.lang}
                      className={
                        (isTarget ? "t" : "l1") +
                        (chunk.pairId ? " flippable" : chunk.counterpart || chunk.wholeSegment ? " seg-flippable" : " seg-flippable")
                      }
                      onClick={() => handleChunkClick(chunk)}
                    >
                      {chunk.text}
                    </span>
                  );
                })}{" "}
              </span>
            ))}
          </p>
        ))}
      </div>

      <AnimatePresence>
        {selection && (
          <m.div className="selection-bar" role="toolbar" {...slabSpring}>
            <button onClick={handleFlipSelection}>Flip selection</button>
            <button onClick={handleSaveCard}>Save as card</button>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <m.div className="toast" {...slabSpring}>
            {toast}
          </m.div>
        )}
      </AnimatePresence>

      <footer className="reader-foot">
        <span>
          {Math.round(rendered.coverage * 100)}% {languageName} on the page · tap anything to flip it · select
          across phrases to flip or save
        </span>

        {!mini && (
          <div className="finish-row">
            {finished ? (
              <span className="finish-done">✓ Read at difficulty {difficulty}</span>
            ) : (
              <button className="secondary" onClick={() => void handleFinished()}>
                ✓ Finished reading
              </button>
            )}
            {onQuiz && (
              <button className="secondary" onClick={() => onQuiz(difficulty)}>
                📝 Quiz me on this story
              </button>
            )}
          </div>
        )}

        {!mini && suggestion && onOpenPool && (
          <div className="next-scenario">
            <span>
              Next scenario: <strong lang={suggestion.targetLang}>{suggestion.titleTarget}</strong> · {suggestion.level}
            </span>
            <button className="secondary" onClick={() => onOpenPool(suggestion)}>
              Open it
            </button>
          </div>
        )}

        {!mini && !feedbackSent && (
          <div className="feedback">
            {verdict === null && (
              <div className="feedback-row">
                <span>Was this story any good?</span>
                <button aria-label="thumbs up" onClick={() => { setVerdict("up"); void submitFeedback("up"); }}>
                  👍
                </button>
                <button aria-label="thumbs down" onClick={() => setVerdict("down")}>
                  👎
                </button>
              </div>
            )}
            {verdict === "down" && (
              <div className="feedback-down">
                <p>What went wrong?</p>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <label key={c} className="feedback-cat">
                    <input
                      type="radio"
                      name="feedback-category"
                      checked={downCategory === c}
                      onChange={() => setDownCategory(c)}
                    />
                    {CATEGORY_LABELS[c]}
                  </label>
                ))}
                <textarea
                  placeholder="Anything else? (optional)"
                  value={downText}
                  onChange={(e) => setDownText(e.target.value)}
                  rows={2}
                />
                <button className="primary" disabled={!downCategory} onClick={() => void submitFeedback("down")}>
                  Send
                </button>
              </div>
            )}
          </div>
        )}
        {feedbackSent && (
          <div className="feedback">
            <span>Thanks — noted.</span>
            {verdict === "down" && story.poolId && onRegenerate && downCategory && (
              <button className="linkish regen-link" onClick={() => onRegenerate(downCategory, downText)}>
                Generate an improved version
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
