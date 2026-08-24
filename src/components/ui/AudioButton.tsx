"use client";

import { useState } from "react";

/**
 * The voice-over trigger (design.md §5). A round bordered chip with a
 * hand-drawn speaker icon; while the clip is being fetched/started the
 * button fills dusty (the info hue) and the sound waves pulse. Clicks are
 * ignored while pending. Pass `label` for the inline text variants
 * ("hear it", "Listen in Spanish"); icon-only otherwise.
 */

interface Props {
  onPlay: () => void | Promise<unknown>;
  label?: string;
  title?: string;
}

export default function AudioButton({ onPlay, label, title }: Props) {
  const [playing, setPlaying] = useState(false);

  return (
    <button
      type="button"
      className={"audio-btn" + (label ? " has-label" : "") + (playing ? " playing" : "")}
      title={title ?? label ?? "Play audio"}
      aria-label={label ? undefined : (title ?? "Play audio")}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) return;
        setPlaying(true);
        void Promise.resolve(onPlay()).finally(() => setPlaying(false));
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M4 9v6h4l5 4.2V4.8L8 9H4z" />
        <path className="wave" d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
        <path className="wave w2" d="M18 7.5a7 7 0 0 1 0 9" />
      </svg>
      {label && <span>{label}</span>}
    </button>
  );
}
