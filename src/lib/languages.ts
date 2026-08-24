/**
 * The launch language set (charter: Spanish, French, German; one named
 * region each — Peninsular, Metropolitan, Standard). Everything
 * language-shaped lives here: nothing elsewhere may hardcode a language.
 *
 * Register is generalised as formal/informal/neutral; each language maps
 * it to its own address system (usted/tú, vous/tu, Sie/du).
 */

import { z } from "zod";

export const TARGET_LANGS = ["es", "fr", "de"] as const;
export type TargetLang = (typeof TARGET_LANGS)[number];

export const REGIONS = ["es-ES", "fr-FR", "de-DE"] as const;
export type Region = (typeof REGIONS)[number];

export const REGISTERS = ["formal", "informal", "neutral"] as const;
export type Register = (typeof REGISTERS)[number];

export interface LanguageConfig {
  code: TargetLang;
  /** English name, for UI copy ("% German on the page") */
  name: string;
  region: Region;
  regionLabel: string;
  /** UI labels for the register selector, in this language's own terms */
  registerLabels: Record<Register, string>;
  /** generation model — German runs on Fable 5 per the model-selection decision */
  model: string;
  /** Curated Azure voices for this region — deliberately SHORT so the
   *  audio cache stays coherent (each voice is its own cache partition).
   *  First entry is the default. All ids carry the region's locale prefix:
   *  accent follows region, structurally. */
  voices: { id: string; label: string }[];
}

export const LANGUAGES: Record<TargetLang, LanguageConfig> = {
  es: {
    code: "es",
    name: "Spanish",
    region: "es-ES",
    regionLabel: "Spain (Peninsular)",
    registerLabels: { formal: "usted — polite", informal: "tú — informal", neutral: "neutral" },
    model: "claude-sonnet-5",
    voices: [
      { id: "es-ES-Ximena:DragonHDLatestNeural", label: "Ximena — natural (HD)" },
      { id: "es-ES-Tristan:DragonHDLatestNeural", label: "Tristán — natural (HD)" },
      { id: "es-ES-ArabellaMultilingualNeural", label: "Arabella — warm" },
      { id: "es-ES-ElviraNeural", label: "Elvira — classic" },
    ],
  },
  fr: {
    code: "fr",
    name: "French",
    region: "fr-FR",
    regionLabel: "France (Metropolitan)",
    registerLabels: { formal: "vous — polite", informal: "tu — informal", neutral: "neutral" },
    model: "claude-sonnet-5",
    voices: [
      { id: "fr-FR-Vivienne:DragonHDLatestNeural", label: "Vivienne — natural (HD)" },
      { id: "fr-FR-Remy:DragonHDLatestNeural", label: "Rémy — natural (HD)" },
      { id: "fr-FR-VivienneMultilingualNeural", label: "Vivienne — warm" },
      { id: "fr-FR-DeniseNeural", label: "Denise — classic" },
    ],
  },
  de: {
    code: "de",
    name: "German",
    region: "de-DE",
    regionLabel: "Germany (Standard)",
    registerLabels: { formal: "Sie — polite", informal: "du — informal", neutral: "neutral" },
    voices: [
      { id: "de-DE-Seraphina:DragonHDLatestNeural", label: "Seraphina — natural (HD)" },
      { id: "de-DE-Florian:DragonHDLatestNeural", label: "Florian — natural (HD)" },
      { id: "de-DE-SeraphinaMultilingualNeural", label: "Seraphina — warm" },
      { id: "de-DE-KatjaNeural", label: "Katja — classic" },
    ],
    // German is the weave stress test; better first drafts cut iteration
    // (charter: model-selection-haiku-sonnet-fable).
    model: "claude-fable-5",
  },
};

export function languageOf(code: string): LanguageConfig {
  const cfg = LANGUAGES[code as TargetLang];
  if (!cfg) throw new Error(`unsupported target language: ${code}`);
  return cfg;
}

/** The region's default voice — first in the curated list. */
export function defaultVoiceFor(code: string): string {
  return languageOf(code).voices[0].id;
}

/** Clamp any requested voice to the curated list (unknown → default). */
export function resolveVoice(code: string, requested?: string | null): string {
  const cfg = languageOf(code);
  return cfg.voices.some((v) => v.id === requested) ? (requested as string) : cfg.voices[0].id;
}

/**
 * Validation derived from the lists above, never re-declared. Every route
 * and every schema imports these: adding a language must be a one-line
 * change here, not a hunt through nine copies of z.enum(["es","fr","de"]).
 */
export const targetLangSchema = z.enum(TARGET_LANGS);
export const regionSchema = z.enum(REGIONS);
export const registerSchema = z.enum(REGISTERS);

/**
 * The language set the open-source edition ships, frozen at the launch
 * three (decision: oss-language-set-frozen-at-launch-three). Languages
 * added to TARGET_LANGS after this point are hosted-only; the OSS export
 * guard fails if TARGET_LANGS ever escapes this list.
 *
 * This is the ONE place the two sets are allowed to differ. It is a
 * deliberate product boundary, not an oversight.
 */
export const OSS_LANGUAGES = ["es", "fr", "de"] as const;
export type OssLanguage = (typeof OSS_LANGUAGES)[number];
