import { NextResponse } from "next/server";
import { generationInputSchema } from "../../../../src/lib/schema";
import { scrubObjectives } from "../../../../src/lib/privacy-scrub";
import { requestContext, requirePaid, unauthorized } from "../../../../src/edition/server";

/**
 * Stage 1: intent → objectives. Haiku 4.5, structured output, through the
 * selected provider (Anthropic API, or the local Claude Code subscription
 * for development). The app talks to its own API (charter) — the client
 * never holds credentials and never calls a provider directly.
 *
 * Goes through requestContext(), not a plain getProvider(), so a stored
 * BYO key both lifts the paywall AND is the key that pays for the call —
 * a free account never rides on pylgrim's own credential (decision:
 * byo-key-unlocks-generation-on-free).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const ctx = await requestContext();
  if (!ctx.userId) return unauthorized();
  const paywall = await requirePaid(ctx.userId, ctx.byoKey);
  if (paywall) return paywall;

  const body = generationInputSchema.pick({ intent: true }).safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 422 });
  }

  try {
    const extraction = await ctx.provider.extract(body.data.intent);
    // Deterministic scrub: the model strips personal detail as best
    // effort; this makes it mechanical. Leaky objectives are dropped.
    const { objectives, dropped } = scrubObjectives(extraction.objectives, body.data.intent);
    if (objectives.length === 0) {
      return NextResponse.json(
        {
          error: "personal_detail",
          message:
            "Every learning goal we extracted still carried personal details. Rephrase without names and specifics, or make this a private story.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ objectives, scrubbed: dropped.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "extraction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
