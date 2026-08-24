import { z } from "zod";
import { generateModelFor } from "../../../../../src/lib/provider";

import { regionSchema, registerSchema, targetLangSchema } from "../../../../../src/lib/languages";
import { quotaResponse, recordGenerationEvent, requestContext, requirePaid, unauthorized } from "../../../../../src/edition/server";

/**
 * PRIVATE generation — objectives plus the user's own specifics. Never
 * touches the pool: no lookup, no insert, no canonical logging of the
 * intent. Free and always available, per story (charter: privacy is
 * never sold as an upgrade).
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  objectives: z.array(z.string().min(3)).min(1).max(8),
  intent: z.string().min(3).max(2000),
  targetLang: targetLangSchema,
  region: regionSchema,
  register: registerSchema,
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
});

export async function POST(req: Request): Promise<Response> {
  const body = requestSchema.safeParse(await req.json());
  if (!body.success) {
    return new Response(JSON.stringify({ error: "invalid request" }), { status: 422 });
  }
  const params = body.data;
  const ctx = await requestContext();
  if (!ctx.userId) return unauthorized();
  const paywall = await requirePaid(ctx.userId);
  if (paywall) return paywall;
  if (!ctx.quota.allowed) return quotaResponse(ctx.quota);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const started = Date.now();
      try {
        const provider = ctx.provider;
        let usage: { input_tokens: number; output_tokens: number } | null = null;
        for await (const event of provider.generate({
          objectives: params.objectives,
          targetLang: params.targetLang,
          region: params.region,
          register: params.register,
          level: params.level,
          personalContext: params.intent,
        })) {
          if (event.t === "usage") usage = event;
          emit(event);
        }
        emit({ t: "done" });
        await recordGenerationEvent({
          userId: ctx.userId,
          kind: "generate",
          provider: provider.name,
          model: generateModelFor(params.targetLang),
          targetLang: params.targetLang,
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
          durationMs: Date.now() - started,
        });
      } catch (err) {
        emit({ t: "error", message: err instanceof Error ? err.message : "generation failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
