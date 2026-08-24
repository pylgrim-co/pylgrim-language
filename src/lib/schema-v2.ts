import { z } from "zod";
import { generatedPairSchema, spanPairSchema, storyMetaSchema } from "./schema";
import { registerSchema } from "./languages";

/**
 * Story format v2 — dialogue tiers (Amendment A1; decision:
 * dialogue-tier-stories-synthesis-format).
 *
 * ONE generation emits an untranslated English narrative skeleton with
 * numbered dialogue slots, plus FIVE dialogue tracks of escalating
 * conversational complexity filling those slots. Alignment and TTS apply
 * to dialogue lines only. Difficulty = selecting a stored track: instant,
 * client-side, free — the charter invariants survive reinterpreted.
 */

export const TIER_COUNT = 5;

// ---------- generation form (what the model emits) ----------

export const generatedDialogueLineSchema = z.object({
  /** display name for the speaker ("Barista", "You", "Frau Weber") */
  speaker: z.string().min(1),
  /** true when this is the LEARNER's own line — response practice hides these */
  is_learner: z.boolean(),
  l1_text: z.string().min(1),
  target_text: z.string().min(1),
  /** realises one of the requested objectives */
  payload: z.boolean(),
  /** 0-based index into the objective list when payload, else null */
  objective_index: z.number().int().min(0).nullable(),
  /** word-index alignment pairs within this line (same format as v1) */
  pairs: z.array(generatedPairSchema),
});
export type GeneratedDialogueLine = z.infer<typeof generatedDialogueLineSchema>;

export const generatedNarrativeBeatSchema = z.object({
  paragraph: z.number().int().min(0),
  /** exactly one of text (English narrative) or slot (dialogue exchange index) */
  text: z.string().min(1).optional(),
  slot: z.number().int().min(0).optional(),
});

export const generatedTierSchema = z.object({
  tier: z.number().int().min(1).max(5),
  /** slots[i] fills narrative slot i — a short exchange of dialogue lines */
  slots: z.array(z.array(generatedDialogueLineSchema).min(1)).min(1),
});

export const generatedStoryV2Schema = z
  .object({
    format: z.literal("dialogue-tiers"),
    title_l1: z.string().min(1),
    title_target: z.string().min(1),
    meta: storyMetaSchema.optional(),
    narrative: z.array(generatedNarrativeBeatSchema).min(2),
    tiers: z.array(generatedTierSchema).length(TIER_COUNT),
  })
  .superRefine((story, ctx) => {
    const slotCount = story.narrative.filter((b) => b.slot !== undefined).length;
    for (const beat of story.narrative) {
      if ((beat.text === undefined) === (beat.slot === undefined)) {
        ctx.addIssue({ code: "custom", message: "narrative beat needs exactly one of text/slot" });
      }
    }
    for (const tier of story.tiers) {
      if (tier.slots.length !== slotCount) {
        ctx.addIssue({ code: "custom", message: `tier ${tier.tier} fills ${tier.slots.length} slots, narrative has ${slotCount}` });
      }
    }
    const tierNumbers = story.tiers.map((t) => t.tier).sort().join(",");
    if (tierNumbers !== "1,2,3,4,5") {
      ctx.addIssue({ code: "custom", message: "tiers must be exactly 1..5" });
    }
  });
export type GeneratedStoryV2 = z.infer<typeof generatedStoryV2Schema>;

// ---------- stored form ----------

export const dialogueLineSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  isLearner: z.boolean(),
  l1Text: z.string().min(1),
  targetText: z.string().min(1),
  payload: z.boolean(),
  objectiveIndex: z.number().int().min(0).nullable(),
  /** character-offset alignment pairs (charter: offsets, never repeated text) */
  pairs: z.array(spanPairSchema),
});
export type DialogueLine = z.infer<typeof dialogueLineSchema>;

export const storyV2Schema = z.object({
  format: z.literal("dialogue-tiers"),
  id: z.string(),
  targetLang: z.string(),
  region: z.string(),
  register: registerSchema,
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  titleL1: z.string(),
  titleTarget: z.string(),
  objectives: z.array(z.string()).min(1),
  tags: z.array(z.string()).default([]),
  narrative: z.array(z.object({ paragraph: z.number().int(), text: z.string().optional(), slot: z.number().int().optional() })),
  tiers: z.array(z.object({ tier: z.number().int(), slots: z.array(z.array(dialogueLineSchema)) })).length(TIER_COUNT),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  intent: z.string().optional(),
  poolId: z.string().optional(),
});
export type StoryV2 = z.infer<typeof storyV2Schema>;
