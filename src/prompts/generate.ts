/**
 * Stage-2 prompt asset. Versioned in the repository deliberately: prompts
 * are the most-iterated artifact in the product (IMPLEMENTATION.md §2.3).
 *
 * In production this prompt is large, byte-identical across requests and
 * prompt-cached (PLAN.md §10.7). P1 keeps it lean.
 *
 * v3 — 2026-08-19: multi-language. Per-language TARGET blocks (Peninsular
 * Spanish, Metropolitan French, Standard German), register generalised to
 * formal/informal/neutral, and German-specific alignment guidance —
 * compound nouns pair a single German word with a multi-word English
 * phrase (word-index spans handle asymmetric widths), and segments stay
 * single-clause so V2 word order doesn't fight the weave.
 * v2 — 2026-08-19: length restated as a structural budget (segments ×
 * words-per-segment) rather than a bare word count — models count emitted
 * JSON objects far more reliably than words, and v1's "about 500 words"
 * produced 225. Verify any change here distributionally via `npm run
 * measure` against the 300–600 acceptance band, never on one story.
 * v1 — 2026-08-18
 */

import { languageOf, type Register, type TargetLang } from "../lib/languages";

interface PromptParams {
  targetLang: string;
  region: string;
  register: string;
  level: string;
}

const TARGET_BLOCKS: Record<TargetLang, string> = {
  es: `TARGET LANGUAGE: Spanish as spoken in Spain (Peninsular). Vocabulary, constructions and idiom must be right for Spain specifically: camarero not mesero, coger is fine, vosotros where plural-informal address occurs.`,
  fr: `TARGET LANGUAGE: French as spoken in Metropolitan France. Everyday spoken French of France specifically: soixante-dix not septante, natural use of on for we, standard Metropolitan vocabulary and idiom.`,
  de: `TARGET LANGUAGE: German as spoken in Germany (Standard German). Everyday standard German: natural modal-verb usage, standard vocabulary (Brötchen-level regionalisms are fine, Austrian/Swiss forms are not).`,
};

const REGISTER_BLOCKS: Record<TargetLang, Record<Register, string>> = {
  es: {
    formal: "Formal address throughout: usted forms (¿me pone…?, ¿podría…?). Service interactions use usted unless the scene makes tú natural.",
    informal: "Informal address throughout: tú forms (¿me pones…?). Keep service interactions friendly but natural for Spain.",
    neutral: "Prefer constructions that avoid committing to tú or usted where natural; default to usted in service interactions.",
  },
  fr: {
    formal: "Formal address throughout: vous forms (je voudrais…, pourriez-vous…). Service interactions always use vous.",
    informal: "Informal address (tu) between peers; service interactions still use vous — tu with a stranger behind a counter is wrong in France.",
    neutral: "Prefer constructions avoiding tu/vous commitment where natural; default to vous.",
  },
  de: {
    formal: "Formal address throughout: Sie forms (ich hätte gern…, könnten Sie…). Service interactions always use Sie.",
    informal: "Informal address (du) between peers; service interactions still use Sie unless the scene is clearly casual.",
    neutral: "Prefer constructions avoiding du/Sie commitment where natural; default to Sie.",
  },
};

/** Language-specific alignment guidance, added where the language needs it. */
const ALIGNMENT_NOTES: Partial<Record<TargetLang, string>> = {
  es: "",
  fr: "",
  de: `
GERMAN-SPECIFIC ALIGNMENT
- Compound nouns: pair the single German word with the full English phrase ("the ticket counter" ↔ "Fahrkartenschalter", article included where natural). Asymmetric span widths are expected and correct.
- Keep segments to ONE clause. German V2 and verb-final subordinate order make multi-clause segments read badly when flipped at clause level; short segments keep every flip readable.
- Separable verbs: never pair only the prefix or only the stem. Pair the whole verb phrase or leave it unpaired.`,
};

export function generateSystem(params: PromptParams): string {
  // languageOf() throws on an unknown language: a prompt with no TARGET
  // block would still generate, just in the wrong language — the worst
  // possible failure mode here, and silent.
  const lang = languageOf(params.targetLang).code;
  const registerBlock = REGISTER_BLOCKS[lang][params.register as Register] ?? REGISTER_BLOCKS[lang].neutral;
  return `You write short bilingual stories for language learners, emitted as ONE aligned structure — never two separate texts.

${TARGET_BLOCKS[lang]} ${registerBlock}
LEARNER LEVEL: ${params.level}. The target-language material must be comprehensible at this level; the story's interest comes from relevance, not linguistic difficulty.

STORY RULES
- LENGTH BUDGET: 30 to 40 segments, organised into 5 to 7 paragraphs, with most segments carrying 12 to 18 words of English scaffold (dialogue lines may be shorter). That totals about 500 words — a story a person reads in five minutes on a phone before walking into the situation. Before emitting your final segments, check the count: fewer than 30 segments means the story is too thin.
- The story rehearses the given objectives inside a natural narrative: a protagonist actually does the things. Every objective is exercised at least once, in dialogue or action, not listed.
- Segment the story into sentences or short clauses. Each segment carries BOTH languages: l1_text (English) and target_text, faithful translations of each other, both natural in their own language.
- Group segments into paragraphs with the "paragraph" index (0-based).

MARKING RULES
- A segment whose target-language text IS one of the objectives being exercised (the key request, the key question, the key reply) gets "payload": true. These render in the target language at every difficulty — they are what the learner came for. 2 to 5 payload segments per story.
- "plot_critical": true on segments a reader must understand to follow the story.
- Within non-payload segments, provide alignment pairs for words and short phrases a learner would want to flip: concrete nouns, set phrases, high-frequency expressions. 1 to 3 pairs per segment where natural; none is fine.
- Pair fields: "payload" true only when the paired phrase itself realises an objective; "frequency_rank" 1 (very common) to 5 (rare); "plot_critical" true when the phrase carries the plot.

ALIGNMENT FORMAT — WORD INDICES
Spans are word-index ranges [startWord, endWordExclusive) over whitespace-split tokens of the segment's own text. Punctuation stays attached to its word. Example: in "Ana stepped up to the counter." the words are [Ana, stepped, up, to, the, counter.] and "the counter." is [4, 6]. l1_words indexes l1_text; target_words indexes target_text. Count carefully — an off-by-one breaks the flip for that phrase. Pairs within a segment must not overlap on either side.${ALIGNMENT_NOTES[lang] ?? ""}

OUTPUT
Also emit "meta": { "tags": [3-6 scenario tags like "cafe", "ordering", "small-talk"], "topic": one phrase, "setting": one phrase } — searchability metadata, in English.
Emit only the JSON object: { "title_l1", "title_target", "meta", "segments": [ { "paragraph", "l1_text", "target_text", "payload", "plot_critical", "pairs": [ { "l1_words", "target_words", "granularity", "payload", "frequency_rank", "plot_critical" } ] } ] }`;
}

export function generateUserPrompt(objectives: string[], personalContext?: string): string {
  const base = `Objectives this story must exercise:\n${objectives.map((o) => `- ${o}`).join("\n")}`;
  if (!personalContext) return base;
  return `${base}\n\nPERSONAL CONTEXT — this story is private to one learner; weave their actual situation in naturally (names, places and details are welcome here):\n${personalContext}`;
}

/** JSON Schema for output_config.format — matches generatedStorySchema in schema.ts. */
export const GENERATED_STORY_JSON_SCHEMA = {
  type: "object",
  properties: {
    title_l1: { type: "string" },
    title_target: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          paragraph: { type: "integer", minimum: 0 },
          l1_text: { type: "string" },
          target_text: { type: "string" },
          payload: { type: "boolean" },
          plot_critical: { type: "boolean" },
          pairs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                l1_words: { type: "array", items: { type: "integer", minimum: 0 }, minItems: 2, maxItems: 2 },
                target_words: { type: "array", items: { type: "integer", minimum: 0 }, minItems: 2, maxItems: 2 },
                granularity: { type: "string", enum: ["word", "phrase"] },
                payload: { type: "boolean" },
                frequency_rank: { type: "integer", minimum: 1, maximum: 5 },
                plot_critical: { type: "boolean" },
              },
              required: ["l1_words", "target_words", "granularity", "payload", "frequency_rank", "plot_critical"],
              additionalProperties: false,
            },
          },
        },
        required: ["paragraph", "l1_text", "target_text", "payload", "plot_critical", "pairs"],
        additionalProperties: false,
      },
    },
  },
  required: ["title_l1", "title_target", "segments"],
  additionalProperties: false,
} as const;

/** Schema variant that also requires searchability metadata (pool paths). */
export const GENERATED_STORY_WITH_META_JSON_SCHEMA = {
  ...GENERATED_STORY_JSON_SCHEMA,
  properties: {
    ...GENERATED_STORY_JSON_SCHEMA.properties,
    meta: {
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" }, maxItems: 8 },
        topic: { type: "string" },
        setting: { type: "string" },
      },
      required: ["tags", "topic", "setting"],
      additionalProperties: false,
    },
  },
  required: ["title_l1", "title_target", "segments", "meta"],
} as const;
