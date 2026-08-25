import { extractionSchema, type Extraction } from "../../../lib/schema";
import { generateSystem, generateUserPrompt, GENERATED_STORY_WITH_META_JSON_SCHEMA } from "../../../prompts/generate";
import { EXTRACT_SYSTEM, EXTRACTION_JSON_SCHEMA, extractUserPrompt } from "../../../prompts/extract";
import type { CompleteJsonParams, GenerateParams, GenEvent, Provider, ProviderName } from "../../../lib/provider";
import { toStrictSchema } from "./json-schema";

/**
 * One provider for every OpenAI-compatible endpoint.
 *
 * OpenRouter speaks the OpenAI chat-completions wire format, so a second
 * implementation would be the same file with a different base URL. The
 * only differences that matter are the endpoint, the key, and a couple of
 * headers OpenRouter uses for attribution.
 *
 * Written against `fetch` rather than a vendor SDK deliberately: it keeps
 * the self-hosted install light, and there is nothing here — one JSON POST
 * and one SSE stream — that an SDK would make clearer.
 *
 * SELF-HOSTING.md carries the honest caveat: structured-output support
 * varies by model, especially through OpenRouter, and a model that cannot
 * hold the schema produces a story whose alignment mostly fails. The
 * alignment floor in offsets.ts is what catches that.
 */

interface Vendor {
  baseUrl: string;
  keyEnv: string;
  modelEnv: string;
  /** shown in errors, so a misconfigured install says which key is missing */
  label: string;
  headers?: Record<string, string>;
}

const VENDORS: Record<"openai" | "openrouter", Vendor> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "PYLGRIM_OPENAI_MODEL",
    label: "OpenAI",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "PYLGRIM_OPENROUTER_MODEL",
    label: "OpenRouter",
    // OpenRouter attributes traffic by these; neither is required.
    headers: {
      "HTTP-Referer": "https://github.com/pylgrim-co/pylgrim-language",
      "X-Title": "pylgrim",
    },
  },
};

/**
 * No default model, on purpose.
 *
 * Vendor model names change often enough that a baked-in default would
 * eventually 404 on a fresh install, and the failure would look like a
 * bug in pylgrim rather than a stale constant. Naming the variable in the
 * error is more useful than guessing on the operator's behalf.
 */
function modelOrThrow(vendor: Vendor): string {
  const model = process.env[vendor.modelEnv];
  if (!model) {
    throw new Error(
      `${vendor.modelEnv} is not set. ${vendor.label} has no default here — pick a model that supports strict JSON schema output and set it, e.g. ${vendor.modelEnv}=<model-id>. See SELF-HOSTING.md.`,
    );
  }
  return model;
}

function keyOrThrow(vendor: Vendor): string {
  const key = process.env[vendor.keyEnv];
  if (!key) throw new Error(`${vendor.keyEnv} is not set`);
  return key;
}

function headers(vendor: Vendor): Record<string, string> {
  return {
    Authorization: `Bearer ${keyOrThrow(vendor)}`,
    "Content-Type": "application/json",
    ...(vendor.headers ?? {}),
  };
}

function responseFormat(name: string, schema: Record<string, unknown>) {
  return {
    type: "json_schema" as const,
    json_schema: { name, strict: true, schema: toStrictSchema(schema) },
  };
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

async function chat(
  vendor: Vendor,
  body: Record<string, unknown>,
): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }> {
  const res = await fetch(`${vendor.baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(vendor),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${vendor.label} request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: ChatUsage;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${vendor.label} returned no content`);
  return {
    content,
    usage: {
      input_tokens: json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.completion_tokens ?? 0,
    },
  };
}

/** Server-sent events → content deltas, with the final usage frame. */
async function* streamChat(vendor: Vendor, body: Record<string, unknown>): AsyncGenerator<GenEvent> {
  const res = await fetch(`${vendor.baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(vendor),
    body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    yield { t: "error", message: `${vendor.label} request failed (${res.status}): ${detail.slice(0, 300)}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: { input_tokens: number; output_tokens: number } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; a partial frame stays buffered.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let parsed: {
        choices?: { delta?: { content?: string } }[];
        usage?: ChatUsage;
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue; // keep-alive or a comment frame
      }
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield { t: "delta", text: delta };
      if (parsed.usage) {
        usage = {
          input_tokens: parsed.usage.prompt_tokens ?? 0,
          output_tokens: parsed.usage.completion_tokens ?? 0,
        };
      }
    }
  }

  yield { t: "usage", input_tokens: usage?.input_tokens ?? 0, output_tokens: usage?.output_tokens ?? 0 };
}

export function makeOpenAiCompatibleProvider(name: "openai" | "openrouter"): Provider {
  const vendor = VENDORS[name];
  return {
    name: name as ProviderName,

    modelFor(): string {
      return modelOrThrow(vendor);
    },

    async extract(intent: string): Promise<Extraction> {
      const { content } = await chat(vendor, {
        model: modelOrThrow(vendor),
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: extractUserPrompt(intent) },
        ],
        response_format: responseFormat("extraction", EXTRACTION_JSON_SCHEMA),
      });
      return extractionSchema.parse(JSON.parse(content));
    },

    async completeJson(params: CompleteJsonParams) {
      const { content, usage } = await chat(vendor, {
        model: params.model,
        max_completion_tokens: params.maxTokens,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        response_format: responseFormat("result", params.schema),
      });
      return { json: JSON.parse(content), usage };
    },

    generate(params: GenerateParams): AsyncGenerator<GenEvent> {
      return streamChat(vendor, {
        model: params.model ?? modelOrThrow(vendor),
        max_completion_tokens: 8000,
        messages: [
          { role: "system", content: generateSystem(params) },
          { role: "user", content: generateUserPrompt(params.objectives, params.personalContext) },
        ],
        response_format: responseFormat("generated_story", GENERATED_STORY_WITH_META_JSON_SCHEMA),
      });
    },
  };
}
