import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { extractionSchema, type Extraction } from "../schema";
import { EXTRACT_SYSTEM, extractUserPrompt } from "../../prompts/extract";
import { generateSystem, generateUserPrompt, GENERATED_STORY_WITH_META_JSON_SCHEMA } from "../../prompts/generate";
import { EXTRACT_MODEL, anthropicModelFor, type CompleteJsonParams, type GenerateParams, type GenEvent, type Provider } from "../provider";

/**
 * Anthropic API provider. The key comes from ANTHROPIC_API_KEY and
 * nowhere else — hosted, that is pylgrim's key; self-hosted, it is the
 * operator's. There is no per-request key, because there is no path by
 * which a user supplies one (decision: no-byo-key-on-the-hosted-product).
 */

export const apiProvider: Provider = (() => {
  const client = () => new Anthropic();
  return {
  name: "anthropic",

  modelFor(kind: "extract" | "generate", targetLang?: string): string {
    return kind === "extract" ? EXTRACT_MODEL : anthropicModelFor(targetLang ?? "es");
  },

  async extract(intent: string): Promise<Extraction> {
    const response = await client().messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 500,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: extractUserPrompt(intent) }],
      output_config: { format: zodOutputFormat(extractionSchema) },
    });
    if (!response.parsed_output) throw new Error("extraction returned no parsable output");
    return response.parsed_output;
  },

  async completeJson(params: CompleteJsonParams) {
    const response = await client().messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
      output_config: { format: { type: "json_schema", schema: params.schema } },
    });
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("completion returned no output");
    return {
      json: JSON.parse(text.text) as unknown,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  },

  async *generate(params: GenerateParams): AsyncGenerator<GenEvent> {
    const stream = client().messages.stream({
      model: params.model ?? anthropicModelFor(params.targetLang),
      max_tokens: 8000,
      system: generateSystem(params),
      messages: [{ role: "user", content: generateUserPrompt(params.objectives, params.personalContext) }],
      output_config: { format: { type: "json_schema", schema: GENERATED_STORY_WITH_META_JSON_SCHEMA } },
    });

    // Bridge event-callback streaming into the async generator.
    const queue: GenEvent[] = [];
    let notify: (() => void) | null = null;
    let finished = false;
    const push = (e: GenEvent) => {
      queue.push(e);
      notify?.();
    };

    stream.on("text", (delta) => push({ t: "delta", text: delta }));
    void stream
      .finalMessage()
      .then((final) => {
        push({ t: "usage", input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens });
      })
      .catch((err: unknown) => {
        push({ t: "error", message: err instanceof Error ? err.message : "generation failed" });
      })
      .finally(() => {
        finished = true;
        notify?.();
      });

    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        notify = null;
        continue;
      }
      yield queue.shift()!;
    }
  },
  };
})();
