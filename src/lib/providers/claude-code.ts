import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { extractionSchema, type Extraction } from "../schema";
import { EXTRACT_SYSTEM, extractUserPrompt } from "../../prompts/extract";
import { generateSystem, generateUserPrompt, GENERATED_STORY_WITH_META_JSON_SCHEMA } from "../../prompts/generate";
import { EXTRACT_MODEL, anthropicModelFor, type CompleteJsonParams, type GenerateParams, type GenEvent, type Provider } from "../provider";

/**
 * Claude Code subscription provider — LOCAL DEVELOPMENT ONLY.
 *
 * Runs both stages through the Claude Agent SDK, which authenticates with
 * the machine's Claude Code login rather than an API key. Each call spawns
 * the bundled CLI, so expect a second or two of startup latency the API
 * path doesn't have. The hosted product never uses this path: a
 * subscription is personal auth, not a service credential.
 *
 * No tools, no filesystem settings, single turn, custom system prompt —
 * this is a plain generation call that happens to travel through the
 * Claude Code harness.
 */

const COMMON_OPTIONS = {
  // No tools, so turns beyond the first exist only for structured-output
  // retries and max-token continuations (long regen prompts need them).
  maxTurns: 4,
  tools: [] as string[],
  allowedTools: [] as string[],
  settingSources: [] as never[],
};

export const claudeCodeProvider: Provider = {
  name: "claude-code",

  modelFor(kind: "extract" | "generate", targetLang?: string): string {
    return kind === "extract" ? EXTRACT_MODEL : anthropicModelFor(targetLang ?? "es");
  },

  async extract(intent: string): Promise<Extraction> {
    let structured: unknown;
    let resultText = "";
    for await (const message of query({
      prompt: extractUserPrompt(intent),
      options: {
        ...COMMON_OPTIONS,
        model: EXTRACT_MODEL,
        systemPrompt: EXTRACT_SYSTEM,
        outputFormat: { type: "json_schema", schema: toCliJsonSchema(extractionSchema) },
      },
    })) {
      if (message.type === "result") {
        if (message.subtype !== "success") throw new Error(`extraction failed: ${message.subtype}`);
        structured = message.structured_output;
        resultText = message.result;
      }
    }
    const raw = structured ?? JSON.parse(stripFences(resultText));
    return extractionSchema.parse(raw);
  },

  async completeJson(params: CompleteJsonParams) {
    let structured: unknown;
    let resultText = "";
    let usage = { input_tokens: 0, output_tokens: 0 };
    for await (const message of query({
      prompt: params.user,
      options: {
        ...COMMON_OPTIONS,
        model: params.model,
        systemPrompt: params.system,
        outputFormat: { type: "json_schema", schema: params.schema },
      },
    })) {
      if (message.type === "result") {
        if (message.subtype !== "success") throw new Error(`completion failed: ${message.subtype}`);
        structured = message.structured_output;
        resultText = message.result;
        usage = { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens };
      }
    }
    const json: unknown = structured ?? JSON.parse(stripFences(resultText));
    return { json, usage };
  },

  async *generate(params: GenerateParams): AsyncGenerator<GenEvent> {
    for await (const message of query({
      prompt: generateUserPrompt(params.objectives, params.personalContext),
      options: {
        ...COMMON_OPTIONS,
        model: params.model ?? anthropicModelFor(params.targetLang),
        systemPrompt: generateSystem(params),
        includePartialMessages: true,
        outputFormat: { type: "json_schema", schema: GENERATED_STORY_WITH_META_JSON_SCHEMA },
      },
    })) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event.type === "content_block_delta") {
          // With structured output the document can arrive as tool-input
          // JSON rather than text — forward both delta kinds as raw text
          // so the client's progressive parser sees the JSON either way.
          if (event.delta.type === "text_delta") yield { t: "delta", text: event.delta.text };
          else if (event.delta.type === "input_json_delta") yield { t: "delta", text: event.delta.partial_json };
        }
      } else if (message.type === "result") {
        if (message.subtype !== "success") {
          yield { t: "error", message: `generation failed: ${message.subtype}` };
          return;
        }
        // The result's structured_output is authoritative over the
        // accumulated deltas; the client prefers it when present.
        if (message.structured_output !== undefined) {
          yield { t: "full", data: message.structured_output };
        }
        yield {
          t: "usage",
          input_tokens: message.usage.input_tokens,
          output_tokens: message.usage.output_tokens,
        };
      }
    }
  },
};

/**
 * zod's toJSONSchema stamps a "$schema" draft identifier the CLI's schema
 * validator rejects ("no schema with key or ref ..."). Drop it.
 */
function toCliJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dropped, ...rest } = z.toJSONSchema(schema);
  return rest;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1] : trimmed;
}
