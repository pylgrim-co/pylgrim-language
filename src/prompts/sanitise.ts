/**
 * Sanitisation prompt for the post-generation share toggle (PLAN.md §7.2).
 * Substitution is a WEAKER guarantee than objectives-only abstraction and
 * the product copy says so; the human review of the full story is the
 * real gate — this pass does the mechanical find-and-generalise and
 * surfaces what it changed.
 *
 * v1 — 2026-08-19
 */

export const SANITISE_SYSTEM = `You prepare a private bilingual learner story for contribution to a shared library by removing personal specifics.

Replace, in BOTH languages consistently:
- personal names → roles ("Maria" → "the landlord", "la casera")
- street addresses, building names, specific venues → generic places ("14 Elm Street" → "the flat")
- dates, times, phone numbers, employers, schools → generic equivalents
- any detail that identifies a person or place (a diagnosis, a court date, "the flat above the chip shop") → a generic equivalent that keeps the story coherent

Do NOT change anything else: keep the same segments in the same order, the same paragraph indices, the same payload/plot flags, and keep the alignment pairs valid — if a substitution changes word counts inside a paired span, recount that pair's word indices; if a pair no longer makes sense, drop it.

Emit the same story JSON shape you received (title_l1, title_target, meta if present, segments), plus a top-level "substitutions" array of { "from": "...", "to": "..." } listing every replacement you made. If there is nothing to replace, return the story unchanged with an empty substitutions array.`;

export function sanitiseUserPrompt(storyJson: string): string {
  return `Sanitise this story:\n\n${storyJson}`;
}

/** JSON Schema: GeneratedStory + substitutions list. */
export function sanitiseSchema(storySchema: Record<string, unknown>): Record<string, unknown> {
  const props = storySchema.properties as Record<string, unknown>;
  return {
    ...storySchema,
    properties: {
      ...props,
      substitutions: {
        type: "array",
        items: {
          type: "object",
          properties: { from: { type: "string" }, to: { type: "string" } },
          required: ["from", "to"],
          additionalProperties: false,
        },
      },
    },
    required: [...(storySchema.required as string[]), "substitutions"],
  };
}
