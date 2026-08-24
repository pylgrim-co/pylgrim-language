/**
 * Quick-translate prompt asset. Same aligned output shape as story
 * generation at miniature scale, so the client renders it with the same
 * reader, flip and card machinery.
 *
 * v2 — 2026-08-19: multi-language via the same per-language blocks as
 * generate.ts; register generalised to formal/informal/neutral.
 * v1 — 2026-08-19
 */

import { languageOf, type Register, type TargetLang } from "../lib/languages";

const TARGET_LINES: Record<TargetLang, string> = {
  es: "TARGET: Spanish as spoken in Spain (Peninsular).",
  fr: "TARGET: French as spoken in Metropolitan France.",
  de: "TARGET: German as spoken in Germany (Standard German).",
};

const REGISTER_LINES: Record<TargetLang, Record<Register, string>> = {
  es: {
    formal: "Formal address (usted forms).",
    informal: "Informal address (tú forms).",
    neutral: "Avoid committing to tú or usted where natural; default to usted in service contexts.",
  },
  fr: {
    formal: "Formal address (vous forms).",
    informal: "Informal address (tu) — but vous with strangers in service contexts.",
    neutral: "Avoid committing to tu or vous where natural; default to vous.",
  },
  de: {
    formal: "Formal address (Sie forms).",
    informal: "Informal address (du) — but Sie with strangers in service contexts.",
    neutral: "Avoid committing to du or Sie where natural; default to Sie.",
  },
};

export function translateSystem(params: { targetLang: string; region: string; register: string; level: string }): string {
  // Throws on an unknown language rather than translating into no
  // particular language — see generate.ts.
  const lang = languageOf(params.targetLang).code;
  const registerLine = REGISTER_LINES[lang][params.register as Register] ?? REGISTER_LINES[lang].neutral;
  return `You translate short English phrases and sentences for a language learner, emitting ONE aligned structure.

${TARGET_LINES[lang]} ${registerLine}
LEARNER LEVEL: ${params.level} — prefer the phrasing a learner at this level should actually say.

RULES
- Treat the input as one or a few segments (split multi-sentence input by sentence). Each segment carries l1_text (the English, cleaned up if fragmentary) and target_text (natural target-language phrasing — idiomatic, never word-by-word).
- "paragraph" is always 0. "payload" is always true — the whole point is the phrase itself. "plot_critical" is false.
- Within each segment give 1-3 alignment pairs for the pieces a learner would want to flip: key nouns, verb phrases, set expressions. Pair fields as in the schema; "payload" true on the pair carrying the core of the request.
- Word-index spans: [startWord, endWordExclusive) over whitespace-split tokens of the segment's own text, punctuation attached to its word. Pairs must not overlap on either side.
- title_l1 is the input trimmed to a few words; title_target is its translation.

Emit only the JSON object with title_l1, title_target, segments.`;
}

export function translateUserPrompt(text: string): string {
  return `Translate:\n\n${text}`;
}
