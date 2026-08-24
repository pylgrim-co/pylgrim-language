import type { Extraction } from "./schema";
import { languageOf } from "./languages";

/**
 * Generation provider abstraction.
 *
 * Two providers, one surface:
 *  - "api"          — Anthropic API SDK, needs ANTHROPIC_API_KEY. The
 *                     production path, and the self-hosted BYO-key path.
 *  - "claude-code"  — Claude Agent SDK, authenticates with the local
 *                     Claude Code subscription login. LOCAL DEVELOPMENT
 *                     ONLY: a subscription is personal auth, not a
 *                     service credential, and the hosted product must
 *                     never sit on one.
 *
 * Selection: PYLGRIM_PROVIDER=api|claude-code wins; otherwise "api" when
 * ANTHROPIC_API_KEY is set, else "claude-code".
 */

export type ProviderName = "api" | "claude-code";

export const EXTRACT_MODEL = "claude-haiku-4-5";

/** Generation model follows the language: German runs on Fable 5 (charter). */
export function generateModelFor(targetLang: string): string {
  return languageOf(targetLang).model;
}

export function resolveProvider(env: Record<string, string | undefined> = process.env): ProviderName {
  const forced = env.PYLGRIM_PROVIDER;
  if (forced === "api" || forced === "claude-code") return forced;
  return env.ANTHROPIC_API_KEY ? "api" : "claude-code";
}

export interface GenerateParams {
  objectives: string[];
  targetLang: string;
  region: string;
  register: "formal" | "informal" | "neutral";
  level: "A1" | "A2" | "B1" | "B2" | "C1";
  /** PRIVATE path only: the user's own specifics, woven into the story.
   *  Shared/pool generation never sets this — by construction. */
  personalContext?: string;
  /** Override the per-language default (charter: the seed library runs on
   *  Fable 5 whatever the language — better first drafts cut revision). */
  model?: string;
}

/** NDJSON-able events, shared by the route, the client and the measure script. */
export type GenEvent =
  | { t: "delta"; text: string }
  | { t: "full"; data: unknown } // authoritative complete document, when the provider has one
  | { t: "usage"; input_tokens: number; output_tokens: number }
  | { t: "error"; message: string };

export interface CompleteJsonParams {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
  /** JSON Schema enforced via structured outputs on both providers */
  schema: Record<string, unknown>;
}

export interface Provider {
  name: ProviderName;
  extract(intent: string): Promise<Extraction>;
  generate(params: GenerateParams): AsyncGenerator<GenEvent>;
  /** One-shot JSON completion — translate, sanitise, and other small jobs. */
  completeJson(params: CompleteJsonParams): Promise<{ json: unknown; usage: { input_tokens: number; output_tokens: number } }>;
}

export async function getProvider(name: ProviderName = resolveProvider(), opts?: { apiKey?: string }): Promise<Provider> {
  // Dynamic imports keep the Agent SDK (which spawns a CLI) out of the
  // bundle entirely when the API path is in use, and vice versa.
  // A BYO key forces the API provider regardless of the resolved default.
  if (opts?.apiKey) {
    const { makeApiProvider } = await import("./providers/api");
    return makeApiProvider(opts.apiKey);
  }
  if (name === "claude-code") {
    const { claudeCodeProvider } = await import("./providers/claude-code");
    return claudeCodeProvider;
  }
  const { apiProvider } = await import("./providers/api");
  return apiProvider;
}
