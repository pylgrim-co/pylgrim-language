import { appendFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import type { GenerationEvent } from "../types";

/**
 * Cost instrumentation, local and honest.
 *
 * A self-hoster pays their own provider bill, so the per-call cost is
 * MORE interesting to them than it is to a subscriber — but there is no
 * database to put it in. Events append to a JSONL file under the cache
 * directory: greppable, jq-able, trivially deletable, and never sent
 * anywhere. Nothing in this edition phones home.
 */

const LOG_PATH = join(process.cwd(), ".pylgrim-cache", "usage.jsonl");

/** USD per MTok, Anthropic list prices (input, output). */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [3, 15],
  "claude-fable-5": [10, 50],
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000;
}

export async function recordGenerationEvent(event: GenerationEvent): Promise<void> {
  const cost =
    event.costUsd !== undefined
      ? event.costUsd
      : event.inputTokens !== undefined && event.outputTokens !== undefined
        ? costUsd(event.model, event.inputTokens, event.outputTokens)
        : null;
  const row = JSON.stringify({ at: new Date().toISOString(), ...event, costUsd: cost });
  try {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, row + "\n", "utf8");
  } catch (err) {
    // Instrumentation must never break the product path.
    console.error("usage log append failed:", err instanceof Error ? err.message : err);
  }
}
