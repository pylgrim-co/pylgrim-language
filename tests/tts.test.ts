import { describe, expect, it } from "vitest";

// vitest does not load .env.local (only Next does); pick it up so the
// live-synthesis gate sees the same env the app runs with.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local — live tests skip */
}
import { clipPath, narrationPath, narrationText, normaliseClipText, ttsCostUsd } from "../src/lib/server/tts";
import { sampleStory } from "../src/data/sample-story";
import { LANGUAGES } from "../src/lib/languages";

describe("audio cache keys", () => {
  it("identical phrases share one clip; voice and language partition the cache", () => {
    const a = clipPath("la cuenta, por favor", "es", "es-ES-ElviraNeural");
    const b = clipPath("  la cuenta, por favor  ", "es", "es-ES-ElviraNeural"); // trim-insensitive
    const c = clipPath("la cuenta, por favor", "es", "es-ES-AlvaroNeural");
    const d = clipPath("la cuenta, por favor", "fr", "es-ES-ElviraNeural");
    expect(a).toBe(b);
    expect(a).not.toBe(c); // the voice IS the accent — different voice, different clip
    expect(a).not.toBe(d);
    expect(a).toMatch(/^clips\/es\/es-ES-ElviraNeural\/[a-f0-9]{40}\.mp3$/);
  });

  it("case and whitespace never split the cache; intonation punctuation does", () => {
    const base = clipPath("La cuenta, por favor", "es", "v");
    expect(clipPath("la  cuenta,   por favor", "es", "v")).toBe(base); // repeat words cost once, ever
    expect(clipPath("¿La cuenta, por favor?", "es", "v")).not.toBe(base); // a question is different audio
    expect(normaliseClipText("  Guten   Morgen ")).toBe("guten morgen");
  });

  it("narration is keyed per (story, voice)", () => {
    const p = narrationPath("pool-123", "es", "es-ES-ElviraNeural");
    expect(p).toBe("narration/es/es-ES-ElviraNeural/pool-123.mp3");
  });
});

describe("charter: audio is never a woven track", () => {
  it("narration text is built from CORE segments only — pure target language", () => {
    const text = narrationText(sampleStory.core.segments);
    // Every core segment's target text is present…
    for (const seg of sampleStory.core.segments) {
      expect(text).toContain(seg.targetText.trim());
    }
    // …and no scaffold English can be: the input type has no l1 field.
    for (const rseg of sampleStory.rendering.segments) {
      expect(text).not.toContain(rseg.l1Text);
    }
  });

  it("every voice in every curated list is region-matched; list stays short", () => {
    for (const lang of Object.values(LANGUAGES)) {
      expect(lang.voices.length).toBeGreaterThanOrEqual(2);
      expect(lang.voices.length).toBeLessThanOrEqual(5); // cache discipline
      for (const v of lang.voices) {
        expect(v.id.startsWith(lang.region), v.id).toBe(true); // accent follows region
      }
    }
  });

  it("unknown voices clamp to the default; HD colon-names sanitise in paths", async () => {
    const { resolveVoice, defaultVoiceFor } = await import("../src/lib/languages");
    const { pathVoice } = await import("../src/lib/server/tts");
    expect(resolveVoice("es", "es-MX-DaliaNeural")).toBe(defaultVoiceFor("es")); // wrong region → default
    expect(resolveVoice("es", "es-ES-ElviraNeural")).toBe("es-ES-ElviraNeural");
    expect(pathVoice("es-ES-Ximena:DragonHDLatestNeural")).toBe("es-ES-Ximena-DragonHDLatestNeural");
    expect(clipPath("hola", "es", "es-ES-Ximena:DragonHDLatestNeural")).not.toContain(":");
  });
});

describe("tts cost", () => {
  it("prices per character at the Azure rate", () => {
    expect(ttsCostUsd(3000)).toBeCloseTo(0.048, 5); // the PLAN.md §14.2 figure
    expect(ttsCostUsd(0)).toBe(0);
  });
});

// ---------- live synthesis (needs AZURE_SPEECH_KEY) ----------

const LIVE = Boolean(process.env.AZURE_SPEECH_KEY && (process.env.AZURE_SPEECH_ENDPOINT || process.env.AZURE_SPEECH_REGION));

describe.skipIf(!LIVE)("azure synthesis (live)", () => {
  it("synthesises Spanish audio and returns real MP3 bytes", { timeout: 60_000 }, async () => {
    const { synthesize } = await import("../src/lib/server/tts");
    const { audio, characters } = await synthesize("Buenos días, ¿me pone un café con leche, por favor?", "es");
    expect(characters).toBeGreaterThan(40);
    expect(audio.length).toBeGreaterThan(5000); // a real utterance, not an error body
  });
});

describe.skipIf(LIVE)("azure synthesis (no key)", () => {
  it.skip("set AZURE_SPEECH_KEY + AZURE_SPEECH_REGION to run live synthesis", () => {});
});
