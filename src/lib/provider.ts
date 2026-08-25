import type { Extraction } from "./schema";
import { languageOf } from "./languages";

/**
 * Generation provider abstraction — the CONTRACT only.
 *
 * Which providers exist, and how one is chosen, is an edition question:
 * the hosted product runs on exactly one key and one vendor, while a
 * self-hoster may point the app at whatever they already pay for. So
 * selection lives in src/edition/{cloud,oss}/provider.ts and the concrete
 * implementations live beside whichever edition may use them.
 *
 * Everything here is shared: the interface, the event shape, and the
 * Anthropic model policy that the charter fixes per language.
 */

export type ProviderName = "anthropic" | "openai" | "openrouter" | "claude-code";

export const EXTRACT_MODEL = "claude-haiku-4-5";

/** Generation model follows the language: German runs on Fable 5 (charter).
 *  Anthropic-specific by definition — other vendors have no equivalent, so
 *  their providers answer modelFor() from their own configuration. */
export function anthropicModelFor(targetLang: string): string {
  return languageOf(targetLang).model;
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
  /**
   * The model this provider will actually use for a job.
   *
   * Callers need this for cost attribution, and they must not guess it:
   * the model is the provider's business, and a route that computed an
   * Anthropic id while an OpenAI provider ran would record a plausible
   * lie in generation_events.
   */
  modelFor(kind: "extract" | "generate", targetLang?: string): string;
  extract(intent: string): Promise<Extraction>;
  generate(params: GenerateParams): AsyncGenerator<GenEvent>;
  /** One-shot JSON completion — translate, sanitise, and other small jobs. */
  completeJson(params: CompleteJsonParams): Promise<{ json: unknown; usage: { input_tokens: number; output_tokens: number } }>;
}
