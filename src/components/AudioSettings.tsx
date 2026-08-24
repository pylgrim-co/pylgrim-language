"use client";

import { useEffect, useState } from "react";
import { languageOf } from "../lib/languages";
import { getAudioPrefs, setAudioPrefs, SPEED_OPTIONS, type AudioPrefs } from "../lib/audio-prefs";
import Select from "./ui/Select";

/**
 * Voice + speed picker, per language. Voice changes take effect on the
 * next synthesis/cache-fetch; speed applies instantly to everything
 * (client-side playbackRate — the cached audio never changes).
 */

interface Props {
  targetLang: string;
  /** notified when prefs change, so live players can re-apply the rate */
  onChange?: (prefs: AudioPrefs) => void;
}

export default function AudioSettings({ targetLang, onChange }: Props) {
  const [prefs, setPrefs] = useState<AudioPrefs | null>(null);
  const lang = languageOf(targetLang);

  useEffect(() => {
    void getAudioPrefs(targetLang).then(setPrefs);
  }, [targetLang]);

  if (!prefs) return null;

  async function update(patch: Partial<AudioPrefs>) {
    const next = await setAudioPrefs(targetLang, patch);
    setPrefs(next);
    onChange?.(next);
  }

  return (
    <div className="audio-settings">
      <label>
        <span>Voice</span>
        <Select
          ariaLabel={`${lang.name} voice`}
          value={prefs.voice}
          options={lang.voices.map((v) => ({ value: v.id, label: v.label }))}
          onChange={(voice) => void update({ voice })}
          minWidth="11rem"
        />
      </label>
      <label>
        <span>Speed</span>
        <Select
          ariaLabel="Playback speed"
          value={String(prefs.rate)}
          options={SPEED_OPTIONS.map((s) => ({ value: String(s.rate), label: s.label }))}
          onChange={(rate) => void update({ rate: Number(rate) })}
          minWidth="7rem"
        />
      </label>
    </div>
  );
}
