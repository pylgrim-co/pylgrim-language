/**
 * Browser-side clip playback, shared by every surface (reader selections,
 * review cards, the cards list, translations). Content-addressed on the
 * server: repeat phrases cost synthesis once, ever.
 */

import { getAudioPrefs } from "./audio-prefs";

export const CLIP_MAX_CHARS = 500;

export async function playClip(text: string, targetLang: string): Promise<string | null> {
  try {
    const prefs = await getAudioPrefs(targetLang);
    const res = await fetch("/api/v1/tts/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang, voice: prefs.voice }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return data.message ?? "audio unavailable";
    }
    const { url } = (await res.json()) as { url: string };
    const audio = new Audio(url);
    // One cached file, any speed: pitch-preserving time stretch is the
    // browser default. Slowing down costs nothing.
    audio.playbackRate = prefs.rate;
    void audio.play();
    return null;
  } catch {
    return "audio unavailable";
  }
}
