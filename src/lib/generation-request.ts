import { z } from "zod";
import { regionSchema, registerSchema, targetLangSchema } from "./languages";

/**
 * The SHARED generation request wire format — one schema imported by the
 * route handler and by tests, so "the request carries no intent" is a
 * property of the schema itself, not of any handler code.
 *
 * .strict() means an intent key — or anything else — is a 422 by
 * construction (charter: pool-eligible stories are generated from
 * objectives only, never the raw intent).
 *
 * `purpose` (work item checkpoint-stories): a checkpoint is the SAME
 * objectives-only generation — same pool key, same superset matching,
 * same schema — flagged only so instrumentation records its kind and the
 * route can require a signed-in user. It adds no new generation mode.
 */
export const sharedGenerationRequestSchema = z
  .object({
    objectives: z.array(z.string().min(3)).min(1).max(8),
    targetLang: targetLangSchema,
    region: regionSchema,
    register: registerSchema,
    level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
    format: z.enum(["weave", "dialogue-tiers"]).default("weave"),
    purpose: z.enum(["standard", "checkpoint"]).default("standard"),
  })
  .strict();

export type SharedGenerationRequest = z.infer<typeof sharedGenerationRequestSchema>;
