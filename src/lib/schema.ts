import { z } from "zod";
import { regionSchema, registerSchema, targetLangSchema } from "./languages";

/**
 * The stored story shape.
 *
 * Charter (see .pylgrim/charter/):
 * - A story is ONE aligned bilingual structure, never two texts.
 * - Span alignment is character offsets into the two strings — no span
 *   carries its own copy of the text (an output-token cost decision).
 * - The story core is L1-independent; the L1 rendering sits over it and
 *   `l1` is a real field, never a hardcoded "en".
 *
 * The model does not emit character offsets directly — models count words
 * far more reliably than characters — so the generation schema (below)
 * uses word-index spans, converted to character offsets in offsets.ts.
 * The stored form is always character offsets.
 */

// ---------- stored form ----------

export const charSpanSchema = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
export type CharSpan = z.infer<typeof charSpanSchema>;

export const spanPairSchema = z.object({
  id: z.string(),
  /** character offsets [start, end) into the segment's l1Text */
  l1: charSpanSchema,
  /** character offsets [start, end) into the segment's targetText */
  target: charSpanSchema,
  granularity: z.enum(["word", "phrase"]),
  /** carries one of the requested objectives — always rendered in the target language */
  payload: z.boolean(),
  /** 1 = very common item, 5 = rare; selection flips common items first */
  frequencyRank: z.number().int().min(1).max(5),
  /** the span carrying the plot — flipped last (narrative safety) */
  plotCritical: z.boolean(),
});
export type SpanPair = z.infer<typeof spanPairSchema>;

export const coreSegmentSchema = z.object({
  id: z.string(),
  /** paragraph index, 0-based; paragraph-granularity flips act on these groups */
  paragraph: z.number().int().min(0),
  targetText: z.string().min(1),
  /** the whole segment is objective payload (e.g. the key request sentence) */
  payload: z.boolean(),
  plotCritical: z.boolean(),
});
export type CoreSegment = z.infer<typeof coreSegmentSchema>;

export const storyCoreSchema = z.object({
  id: z.string(),
  targetLang: z.string(), // "es" | "fr" | "de" — stored loosely, validated at the input edge
  region: z.string(), // "es-ES" | "fr-FR" | "de-DE"
  register: registerSchema,
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  title: z.string(),
  objectives: z.array(z.string()).min(1),
  segments: z.array(coreSegmentSchema).min(1),
});
export type StoryCore = z.infer<typeof storyCoreSchema>;

export const renderingSegmentSchema = z.object({
  segmentId: z.string(),
  l1Text: z.string().min(1),
  pairs: z.array(spanPairSchema),
});
export type RenderingSegment = z.infer<typeof renderingSegmentSchema>;

export const l1RenderingSchema = z.object({
  storyId: z.string(),
  l1: z.string(), // "en" — a field, never hardcoded downstream
  title: z.string(),
  segments: z.array(renderingSegmentSchema).min(1),
});
export type L1Rendering = z.infer<typeof l1RenderingSchema>;

export const storySchema = z.object({
  core: storyCoreSchema,
  rendering: l1RenderingSchema,
  createdAt: z.string(),
  /** local clock of the last local change — LWW input for sync */
  updatedAt: z.string().optional(),
  /** the raw intent that produced it — synced to the owner's account only, never shared */
  intent: z.string().optional(),
  /** set when this story exists in (or came from) the shared pool */
  poolId: z.string().optional(),
});
export type Story = z.infer<typeof storySchema>;

// ---------- generation form (what the model emits) ----------

/** word-index span [startWord, endWordExclusive) over whitespace-split tokens */
export const wordSpanSchema = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

export const generatedPairSchema = z.object({
  l1_words: wordSpanSchema,
  target_words: wordSpanSchema,
  granularity: z.enum(["word", "phrase"]),
  payload: z.boolean(),
  frequency_rank: z.number().int().min(1).max(5),
  plot_critical: z.boolean(),
});
export type GeneratedPair = z.infer<typeof generatedPairSchema>;

export const generatedSegmentSchema = z.object({
  paragraph: z.number().int().min(0),
  l1_text: z.string().min(1),
  target_text: z.string().min(1),
  payload: z.boolean(),
  plot_critical: z.boolean(),
  pairs: z.array(generatedPairSchema),
});
export type GeneratedSegment = z.infer<typeof generatedSegmentSchema>;

export const storyMetaSchema = z.object({
  tags: z.array(z.string()).max(8).default([]),
  topic: z.string().default(""),
  setting: z.string().default(""),
});

export const generatedStorySchema = z.object({
  title_l1: z.string().min(1),
  title_target: z.string().min(1),
  segments: z.array(generatedSegmentSchema).min(1),
  /** emitted at generation time - nearly free, expensive to backfill (7.5) */
  meta: storyMetaSchema.optional(),
});
export type GeneratedStory = z.infer<typeof generatedStorySchema>;

// ---------- extraction form ----------

export const extractionSchema = z.object({
  objectives: z
    .array(z.string().min(3))
    .min(1)
    .max(8)
    .describe("Testable capability statements, e.g. 'order a drink politely'"),
});
export type Extraction = z.infer<typeof extractionSchema>;

// ---------- structured inputs (charter: never parsed from the intent) ----------

export const generationInputSchema = z.object({
  intent: z.string().min(3).max(2000),
  targetLang: targetLangSchema,
  region: regionSchema, // one named region per language (seed decision)
  register: registerSchema,
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
});
export type GenerationInput = z.infer<typeof generationInputSchema>;

// ---------- cards ----------

export const cardSchema = z.object({
  id: z.string(),
  l1Text: z.string().min(1),
  targetText: z.string().min(1),
  targetLang: z.string(),
  region: z.string(),
  storyId: z.string(),
  segmentId: z.string(),
  createdAt: z.string(),
  /** local clock of the last local change — LWW input for sync */
  updatedAt: z.string().optional(),
  /** FSRS scheduling state (ts-fsrs Card), owned by the review engine */
  scheduling: z.unknown().optional(),
});
export type Card = z.infer<typeof cardSchema>;
