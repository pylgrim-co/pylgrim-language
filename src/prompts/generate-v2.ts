/**
 * Stage-2 prompt asset, story format v2 — dialogue tiers (Amendment A1).
 * ONE call produces the English narrative skeleton and all five dialogue
 * tracks. Versioned like every prompt asset.
 *
 * v1 — 2026-08-22
 */

import { languageOf, type Register, type TargetLang } from "../lib/languages";

interface PromptParams {
  targetLang: string;
  region: string;
  register: string;
  level: string;
}

const TARGET_LINES: Record<TargetLang, string> = {
  es: "DIALOGUE LANGUAGE: Spanish as spoken in Spain (Peninsular) — camarero not mesero, natural Peninsular idiom throughout.",
  fr: "DIALOGUE LANGUAGE: French as spoken in Metropolitan France.",
  de: "DIALOGUE LANGUAGE: German as spoken in Germany (Standard German).",
};

const REGISTER_LINES: Record<TargetLang, Record<Register, string>> = {
  es: { formal: "Address: usted forms in service interactions.", informal: "Address: tú where natural; usted with strangers behind counters.", neutral: "Default to usted in service interactions." },
  fr: { formal: "Address: vous forms.", informal: "Address: tu between peers, vous in service interactions.", neutral: "Default to vous." },
  de: { formal: "Address: Sie forms.", informal: "Address: du between peers, Sie in service interactions.", neutral: "Default to Sie." },
};

export function generateV2System(params: PromptParams): string {
  // Throws on an unknown language rather than emitting a prompt with no
  // DIALOGUE LANGUAGE line — see generate.ts.
  const lang = languageOf(params.targetLang).code;
  return `You write a SHORT ENGLISH STORY whose dialogue exists at five levels of conversational difficulty, for a learner who wants to understand what is said to them and respond.

${TARGET_LINES[lang]} ${REGISTER_LINES[lang][params.register as Register] ?? REGISTER_LINES[lang].neutral}
LEARNER BASE LEVEL: ${params.level} — tier 1 must be comfortable AT this level; tier 5 stretches well beyond it.

STRUCTURE
- A narrative skeleton in ENGLISH ONLY: 6-10 beats, 15-30 words each, warm and concrete — it carries the situation, never the language teaching. Number its paragraphs from 0.
- 3 to 6 DIALOGUE SLOTS placed between narrative beats (a beat with "slot": n instead of "text"). Slots are the conversational moments of the scenario, in order.
- FIVE TIERS. Each tier fills EVERY slot with a complete exchange (2-6 lines). All five tiers tell the same scenario with the same outcome — only the conversation deepens.

THE COMPLEXITY LADDER (this is the product)
- Tier 1: minimal survival exchanges — short formulaic turns (3-7 words), slow, maximally standard.
- Tier 2: full simple sentences, one clause per turn, polite formulas complete.
- Tier 3: natural everyday pace — connectors, a follow-up question, mild variation.
- Tier 4: longer turns, subordinate clauses, idiomatic phrasing, a small complication handled in conversation.
- Tier 5: how natives actually talk when nobody is slowing down — colloquial, fast, elliptical, an interruption or repair, regional flavour.
HARD RULE: the average words-per-turn must STRICTLY INCREASE from tier 1 to tier 4. Tier 5 may run slightly shorter than tier 4 — ellipsis is native — but must stay clearly above tier 3. Check before emitting.

LINE RULES
- Every line carries l1_text (natural English) and target_text (natural target language), faithful translations.
- "speaker": short display name; the learner's own lines use speaker "You" and "is_learner": true. Every slot contains at least one learner line — the learner always has something to say.
- OBJECTIVES: every tier must exercise EVERY objective. Mark the line that realises objective k with "payload": true and "objective_index": k (0-based, matching the given list order). Non-payload lines: payload false, objective_index null.
- "pairs": 0-3 word-index alignment pairs per line for phrases worth flipping — [startWord, endWordExclusive) over whitespace-split tokens of the line's OWN text, punctuation attached; l1_words indexes l1_text, target_words indexes target_text; no overlaps. Fields: granularity word|phrase, payload (realises an objective), frequency_rank 1-5, plot_critical.

OUTPUT
Also emit "meta": { "tags": [3-6 scenario tags], "topic", "setting" } in English.
Emit only the JSON object: { "format": "dialogue-tiers", "title_l1", "title_target", "meta", "narrative": [ { "paragraph", "text" } | { "paragraph", "slot" } ], "tiers": [ { "tier", "slots": [ [ line... ] ] } ] }`;
}

export function generateV2UserPrompt(objectives: string[]): string {
  return `Objectives every tier must exercise (index order matters for objective_index):\n${objectives.map((o, i) => `${i}. ${o}`).join("\n")}`;
}

const LINE_SCHEMA = {
  type: "object",
  properties: {
    speaker: { type: "string" },
    is_learner: { type: "boolean" },
    l1_text: { type: "string" },
    target_text: { type: "string" },
    payload: { type: "boolean" },
    objective_index: { type: ["integer", "null"], minimum: 0 },
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
  required: ["speaker", "is_learner", "l1_text", "target_text", "payload", "objective_index", "pairs"],
  additionalProperties: false,
} as const;

export const GENERATED_STORY_V2_JSON_SCHEMA = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["dialogue-tiers"] },
    title_l1: { type: "string" },
    title_target: { type: "string" },
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
    narrative: {
      type: "array",
      items: {
        type: "object",
        properties: {
          paragraph: { type: "integer", minimum: 0 },
          text: { type: "string" },
          slot: { type: "integer", minimum: 0 },
        },
        required: ["paragraph"],
        additionalProperties: false,
      },
    },
    tiers: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          tier: { type: "integer", minimum: 1, maximum: 5 },
          slots: { type: "array", items: { type: "array", items: LINE_SCHEMA, minItems: 1 } },
        },
        required: ["tier", "slots"],
        additionalProperties: false,
      },
    },
  },
  required: ["format", "title_l1", "title_target", "meta", "narrative", "tiers"],
  additionalProperties: false,
} as const;
