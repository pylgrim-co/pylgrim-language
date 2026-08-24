import { NextResponse } from "next/server";
import { z } from "zod";
import { clipPath, synthesize, ttsConfigured, ttsCostUsd } from "../../../../../src/lib/server/tts";

import { resolveVoice, targetLangSchema } from "../../../../../src/lib/languages";
import { audioExists, audioUrl, recordGenerationEvent, requirePaid, requireUserId, uploadAudio } from "../../../../../src/edition/server";

/**
 * Per-span and per-card audio: short, single-language, trivially correct
 * (charter). Content-addressed — the same phrase synthesises once and is
 * reused across every user and story.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  text: z.string().min(1).max(500),
  targetLang: targetLangSchema,
  voice: z.string().max(80).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await requireUserId();
  if ("response" in session) return session.response;

  const body = requestSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "invalid request" }, { status: 422 });

  const { text, targetLang } = body.data;
  const voice = resolveVoice(targetLang, body.data.voice);
  const path = clipPath(text, targetLang, voice);

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
        { error: "tts_unconfigured", message: "Audio needs AZURE_SPEECH_KEY plus AZURE_SPEECH_ENDPOINT or AZURE_SPEECH_REGION." },
        { status: 503 },
      );
    }

    const started = Date.now();
    const { audio, characters } = await synthesize(text.trim(), targetLang, voice);
    await uploadAudio(path, audio);

    await recordGenerationEvent({
      userId: session.userId,
      kind: "tts",
      provider: "azure",
      model: voice,
      targetLang,
      inputTokens: characters, // characters, not tokens
      costUsd: ttsCostUsd(characters),
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ url: audioUrl(path), cached: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "clip failed" }, { status: 502 });
  }
}
