import { createHash } from "crypto";
import { languageOf, resolveVoice } from "../languages";
import type { CoreSegment } from "../schema";

/**
 * TTS — Azure Speech (decision: use-azure-speech-for-tts). Charter:
 * audio is NEVER a woven mixed-language track; every synthesis call here
 * is single-language by construction — narration input is built from the
 * story CORE (target text only), clips are single target-language spans.
 *
 * Azure REST rather than the Speech SDK: one POST, no native dependency.
 * BYO-key friendly: env-driven, same pattern as generation.
 */

export const AZURE_TTS_USD_PER_MCHAR = 16;

export function ttsConfigured(): boolean {
  return Boolean(process.env.AZURE_SPEECH_KEY && (process.env.AZURE_SPEECH_ENDPOINT || process.env.AZURE_SPEECH_REGION));
}

/**
 * Either endpoint style works with the same key (Speech REST reference):
 *  - AZURE_SPEECH_ENDPOINT: the resource's own subdomain, e.g.
 *    https://my-resource.cognitiveservices.azure.com  (what AI Foundry shows)
 *  - AZURE_SPEECH_REGION: the classic regional host, e.g. westeurope
 */
function ttsUrl(): string {
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT;
  if (endpoint) return `${endpoint.replace(/\/+$/, "")}/tts/cognitiveservices/v1`; // custom subdomains serve TTS under /tts (probed, not assumed)
  const region = process.env.AZURE_SPEECH_REGION;
  if (!region) throw new Error("set AZURE_SPEECH_ENDPOINT or AZURE_SPEECH_REGION");
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

function ssmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Charter guard made structural: narration text comes only from core
 * segments (the L1 rendering never reaches this function's signature).
 */
export function narrationText(segments: CoreSegment[]): string {
  return segments.map((s) => s.targetText.trim()).join(" ");
}

/** Voice ids can contain ':' (Azure HD naming) — storage paths get a
 *  sanitised segment; SSML always gets the real id. */
export function pathVoice(voice: string): string {
  return voice.replace(/[^A-Za-z0-9_-]/g, "-");
}

/** Cache-key normalisation: case and whitespace never change
 *  pronunciation in es/fr/de, so they never split the cache. Punctuation
 *  STAYS — ¿…? and ¡…! change intonation, so they are different audio. */
export function normaliseClipText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Content-addressed cache path: identical phrases share one clip across
 *  every user and every story (PLAN.md §8.1) — repeat words cost once,
 *  ever. Voice is in the key — it IS the accent. */
export function clipPath(text: string, targetLang: string, voice: string): string {
  const hash = createHash("sha256").update(`${targetLang}|${voice}|${normaliseClipText(text)}`).digest("hex").slice(0, 40);
  return `clips/${targetLang}/${pathVoice(voice)}/${hash}.mp3`;
}

export function narrationPath(cacheKey: string, targetLang: string, voice: string): string {
  return `narration/${targetLang}/${pathVoice(voice)}/${cacheKey}.mp3`;
}

export interface SynthesisResult {
  audio: Buffer;
  characters: number;
}

/** One Azure REST call: SSML in, MP3 out. */
export async function synthesize(text: string, targetLang: string, voice?: string): Promise<SynthesisResult> {
  const key = process.env.AZURE_SPEECH_KEY;
  if (!key) throw new Error("AZURE_SPEECH_KEY is not set");

  const lang = languageOf(targetLang);
  const voiceId = resolveVoice(targetLang, voice);
  const ssml = `<speak version='1.0' xml:lang='${lang.region}'><voice name='${voiceId}'>${ssmlEscape(text)}</voice></speak>`;

  const res = await fetch(ttsUrl(), {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "pylgrim-language",
    },
    body: ssml,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`azure tts failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return { audio: Buffer.from(await res.arrayBuffer()), characters: text.length };
}

export function ttsCostUsd(characters: number): number {
  return (characters * AZURE_TTS_USD_PER_MCHAR) / 1_000_000;
}
