import { db } from "./db";
import { resolveVoice } from "./languages";

/**
 * Per-language audio preferences: which curated voice, and how fast.
 * Speed is applied CLIENT-SIDE via playbackRate (pitch preserved by the
 * browser) — one cached file serves every speed, so slowing down costs
 * nothing and never fragments the audio cache.
 */

export const SPEED_OPTIONS = [
  { rate: 0.6, label: "slow" },
  { rate: 0.8, label: "relaxed" },
  { rate: 1.0, label: "natural" },
] as const;

export interface AudioPrefs {
  voice: string;
  rate: number;
}

const cache = new Map<string, AudioPrefs>();

export async function getAudioPrefs(targetLang: string): Promise<AudioPrefs> {
  const cached = cache.get(targetLang);
  if (cached) return cached;
  const stored = await db.getMeta<Partial<AudioPrefs>>(`audioPrefs:${targetLang}`).catch(() => undefined);
  const prefs: AudioPrefs = {
    voice: resolveVoice(targetLang, stored?.value?.voice),
    rate: clampRate(stored?.value?.rate),
  };
  cache.set(targetLang, prefs);
  return prefs;
}

export async function setAudioPrefs(targetLang: string, update: Partial<AudioPrefs>): Promise<AudioPrefs> {
  const current = await getAudioPrefs(targetLang);
  const next: AudioPrefs = {
    voice: update.voice !== undefined ? resolveVoice(targetLang, update.voice) : current.voice,
    rate: update.rate !== undefined ? clampRate(update.rate) : current.rate,
  };
  cache.set(targetLang, next);
  await db.setMeta(`audioPrefs:${targetLang}`, next);
  return next;
}

export function clampRate(rate: number | undefined): number {
  if (rate === undefined || Number.isNaN(rate)) return 1.0;
  return Math.min(1.25, Math.max(0.5, rate));
}
