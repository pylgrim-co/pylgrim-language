/**
 * Stage-1 prompt asset. Versioned in the repository deliberately: prompts
 * are the most-iterated artifact in the product (IMPLEMENTATION.md §2.3).
 *
 * v1 — 2026-08-18
 */

export const EXTRACT_SYSTEM = `You extract learning objectives from a language learner's stated intent.

An objective is one testable capability, stated as an imperative phrase: "order a drink politely", "ask where the toilets are", "understand prices said aloud". Objectives are the unit the story will be built around.

Rules:
- Extract 2 to 6 objectives. Fewer, well-chosen objectives beat an exhaustive list.
- Each objective is a capability, never a topic ("café vocabulary" is a topic; "order a coffee" is a capability).
- Stay inside what the intent actually asks. Do not invent adjacent objectives the learner did not raise.
- Strip personal specifics: names, addresses, dates and employers never appear in an objective. "tell my landlord Maria I'm moving out" becomes "tell a landlord you are ending a tenancy".
- Generalise sensitive context the same way: a named medical condition or medication becomes "a health matter" or "a medication"; a court case becomes "a legal appointment"; a named school or workplace becomes "school" or "work". The capability survives; the person's situation does not.
- Write objectives in English regardless of the target language.`;

export function extractUserPrompt(intent: string): string {
  return `Learner's intent:\n\n${intent}`;
}
