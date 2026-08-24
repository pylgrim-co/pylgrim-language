import { NextResponse } from "next/server";
import { z } from "zod";
import { generatedStorySchema } from "../../../../src/lib/schema";
import { generateModelFor } from "../../../../src/lib/provider";
import { translateSystem, translateUserPrompt } from "../../../../src/prompts/translate";
import { GENERATED_STORY_JSON_SCHEMA } from "../../../../src/prompts/generate";

import { regionSchema, registerSchema, targetLangSchema } from "../../../../src/lib/languages";
import { recordGenerationEvent, requestContext, requirePaid, unauthorized } from "../../../../src/edition/server";

/**
 * Quick translate: short text in, a miniature aligned structure out —
 * the same shape as a story, so the client reuses the reader, flip and
 * card machinery wholesale.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  text: z.string().min(1).max(500),
  targetLang: targetLangSchema,
  region: regionSchema,
  register: registerSchema,
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
});

export async function POST(req: Request): Promise<Response> {
  const body = requestSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "invalid request" }, { status: 422 });

  try {
    const ctx = await requestContext();
    if (!ctx.userId) return unauthorized();
    const paywall = await requirePaid(ctx.userId);
    if (paywall) return paywall;
    const provider = ctx.provider;
    const model = generateModelFor(body.data.targetLang);
    const started = Date.now();
    const { json, usage } = await provider.completeJson({
      system: translateSystem(body.data),
      user: translateUserPrompt(body.data.text),
      model,
      maxTokens: 1500,
      schema: GENERATED_STORY_JSON_SCHEMA as unknown as Record<string, unknown>,
    });
    const story = generatedStorySchema.parse(json);
    await recordGenerationEvent({
      userId: ctx.userId,
      kind: "translate",
      provider: provider.name,
      model,
      targetLang: body.data.targetLang,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs: Date.now() - started,
    });
    return NextResponse.json(story);
  } catch (err) {
    const message = err instanceof Error ? err.message : "translation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
