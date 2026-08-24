"use client";

import { useEffect, useMemo, useState } from "react";
import type { Story } from "../lib/schema";
import type { StoryV2 } from "../lib/schema-v2";
import { db } from "../lib/db";
import { weakObjectives } from "../lib/mastery";
import { checkpointObjectives, CHECKPOINT_MAX_OBJECTIVES } from "../lib/checkpoint";
import { Sparkle, Blob } from "./ui/Doodle";

/**
 * Checkpoint builder (work item checkpoint-stories). Pick stories to be
 * tested on — or lean on your weak objectives — and generate ONE fresh
 * story weaving their objectives together. User-initiated, never
 * scheduled; signed-in only (the route enforces it too).
 */

interface Props {
  stories: Story[];
  storiesV2: StoryV2[];
  onGenerate: (objectives: string[]) => void;
  onBack: () => void;
}

export default function Checkpoint({ stories, storiesV2, onGenerate, onBack }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeWeak, setIncludeWeak] = useState(true);
  const [weak, setWeak] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [cards, events, s, s2] = await Promise.all([
        db.listCards(),
        db.listReviewEvents(),
        db.listStories(),
        db.listStoriesV2(),
      ]);
      setWeak(weakObjectives(cards, events, s, s2));
    })().catch(() => {});
  }, []);

  const entries = useMemo(
    () => [
      ...storiesV2.map((s) => ({ id: s.id, title: s.titleTarget, lang: s.targetLang, objectives: s.objectives })),
      ...stories.map((s) => ({ id: s.core.id, title: s.core.title, lang: s.core.targetLang, objectives: s.core.objectives })),
    ],
    [stories, storiesV2],
  );

  const objectives = useMemo(
    () =>
      checkpointObjectives(
        entries.filter((e) => selected.has(e.id)),
        includeWeak ? weak : [],
      ),
    [entries, selected, includeWeak, weak],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="checkpoint">
      <div className="page-head">
        <Blob hue="ochre" delay="300ms" style={{ right: "-2rem", top: "-2.2rem", width: "8rem", height: "8rem", opacity: 0.4 }} />
        <Sparkle hue="sage" wiggle style={{ top: "-0.8rem", left: "13rem", width: "1.9rem", height: "1.9rem" }} />
        <h1>Checkpoint story</h1>
      </div>
      <p className="hint">
        Pick what you want to be tested on. One fresh story weaves those objectives together — then quiz yourself on it and
        watch the before/after in Progress.
      </p>

      <label className="check">
        <input type="checkbox" checked={includeWeak} onChange={(e) => setIncludeWeak(e.target.checked)} disabled={weak.length === 0} />
        <span className="box" />
        <span>Include my weak objectives{weak.length > 0 ? ` (${weak.join("; ")})` : " (none yet — review some cards first)"}</span>
      </label>

      {entries.length === 0 && <p className="hint">No stories yet — read and save a few first.</p>}
      <ul className="checkpoint-list">
        {entries.map((e) => (
          <li key={e.id}>
            <label className="check">
              <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
              <span className="box" />
              <span>
                <span lang={e.lang}>{e.title}</span>{" "}
                <span className="meta">· {e.objectives.length} objective{e.objectives.length === 1 ? "" : "s"}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {objectives.length > 0 && (
        <div className="checkpoint-preview">
          <p className="hint">
            This checkpoint will test ({objectives.length} of max {CHECKPOINT_MAX_OBJECTIVES}):
          </p>
          <p className="objectives">
            {objectives.map((o) => (
              <span key={o} className="objective-chip">
                {o}
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="row">
        <button onClick={onBack}>Back</button>
        <button className="primary" disabled={objectives.length === 0} onClick={() => onGenerate(objectives)}>
          Generate the checkpoint story
        </button>
      </div>
    </section>
  );
}
