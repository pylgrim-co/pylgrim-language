import { NextResponse } from "next/server";
import { z } from "zod";
import { coreSegmentSchema } from "../../../../../src/lib/schema";
import { narrationText, narrationPath, synthesize, ttsConfigured, ttsCostUsd } from "../../../../../src/lib/server/tts";

import { resolveVoice, targetLangSchema } from "../../../../../src/lib/languages";
import { audioExists, audioUrl, recordGenerationEvent, requirePaid, requireUserId, uploadAudio } from "../../../../../src/edition/server";

/**
 * Full target-language story narration (charter: the whole story read in
 * the target language, IGNORING the weave — one track serves every
 * difficulty). Generated once per (story, voice), cached in storage,
 * served free thereafter.
 *
 * The request carries CORE segments only — the schema has no field for
 * scaffold text, so a woven input is unrepresentable here.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  /** story core id (local story) or pool id — the cache key */
  cacheKey: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
  targetLang: targetLangSchema,
  voice: z.string().max(80).optional(),
  segments: z.array(coreSegmentSchema).min(1).max(80),
});

export async function POST(req: Request): Promise<Response> {
  const session = await requireUserId();
  if ("response" in session) return session.response;

  const body = requestSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "invalid request" }, { status: 422 });

  const { cacheKey, targetLang, segments } = body.data;
  const voice = resolveVoice(targetLang, body.data.voice);
  const path = narrationPath(cacheKey, targetLang, voice);

  try {
    if (await audioExists(path)) {
      return NextResponse.json({ url: audioUrl(path), cached: true });
    }

    // A stored file is not an AI call: cache hits above are free for
    // everyone (charter). Synthesising a NEW clip is inference, so the
    // paywall sits here, between the hit and the call.
    const paywall = await requirePaid(session.userId);
    if (paywall) return paywall;

    if (!ttsConfigured()) {
      return NextResponse.json(
        { error: "tts_unconfigured", message: "Narration needs AZURE_SPEECH_KEY plus AZURE_SPEECH_ENDPOINT or AZURE_SPEECH_REGION." },
        { status: 503 },
      );
    }

    const text = narrationText(segments);
    if (text.length > 9000) {
      return NextResponse.json({ error: "story too long for a single narration call" }, { status: 422 });
    }
    const started = Date.now();
    const { audio, characters } = await synthesize(text, targetLang, voice);
    await uploadAudio(path, audio);

    await recordGenerationEvent({
      userId: session.userId,
      kind: "tts",
      provider: "azure",
      model: voice,
      targetLang,
      inputTokens: characters, // characters, not tokens — TTS is priced per character
      costUsd: ttsCostUsd(characters),
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ url: audioUrl(path), cached: false, characters });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "narration failed" }, { status: 502 });
  }
}
