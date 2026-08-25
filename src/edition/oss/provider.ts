import type { Provider, ProviderName } from "../../lib/provider";

/**
 * Provider selection, self-hosted.
 *
 * A self-hoster pays their own inference bill, so they get to spend it
 * wherever they already have credit: Anthropic, OpenAI, or anything
 * OpenRouter fronts. This is the one place bring-your-own-key exists —
 * the hosted product takes no user key at all
 * (decision: no-byo-key-on-the-hosted-product).
 *
 * Selection is PYLGRIM_PROVIDER when set, otherwise the first vendor
 * whose key is present, in the order below. Anthropic leads because the
 * prompts and the per-language model policy were tuned against it; the
 * others work, with the caveats in SELF-HOSTING.md.
 */

const ORDER: { name: ProviderName; env: string }[] = [
  { name: "anthropic", env: "ANTHROPIC_API_KEY" },
  { name: "openai", env: "OPENAI_API_KEY" },
  { name: "openrouter", env: "OPENROUTER_API_KEY" },
];

export function resolveProvider(env: Record<string, string | undefined> = process.env): ProviderName {
  const forced = env.PYLGRIM_PROVIDER;
  if (forced === "claude-code") return "claude-code";
  if (forced === "anthropic" || forced === "api") return "anthropic";
  if (forced === "openai") return "openai";
  if (forced === "openrouter") return "openrouter";
  return ORDER.find((p) => env[p.env])?.name ?? "claude-code";
}

export async function getProvider(name: ProviderName = resolveProvider()): Promise<Provider> {
  // Dynamic imports keep each vendor's client out of the bundle unless it
  // is the one in use.
  if (name === "claude-code") {
    const { claudeCodeProvider } = await import("../../lib/providers/claude-code");
    return claudeCodeProvider;
  }
  if (name === "openai" || name === "openrouter") {
    const { makeOpenAiCompatibleProvider } = await import("./providers/openai-compatible");
    return makeOpenAiCompatibleProvider(name);
  }
  const { apiProvider } = await import("../../lib/providers/api");
  return apiProvider;
}
