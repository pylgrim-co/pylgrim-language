import { describe, expect, it } from "vitest";
import { toStrictSchema } from "../src/edition/oss/providers/json-schema";
import { GENERATED_STORY_WITH_META_JSON_SCHEMA } from "../src/prompts/generate";
import { EXTRACTION_JSON_SCHEMA } from "../src/prompts/extract";

/**
 * OpenAI-compatible strict structured output takes a small subset of JSON
 * Schema and REJECTS the rest rather than ignoring it, so an unsupported
 * keyword fails the request before the model sees the prompt. Our
 * generation schema uses four of them.
 *
 * These tests exist because the failure is remote, silent in development
 * (the Anthropic path never touches this) and only shows up for the
 * self-hoster who chose OpenAI or OpenRouter.
 */

const BANNED = ["minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "default"];

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    Object.values(node as Record<string, unknown>).forEach((v) => walk(v, visit));
  }
}

describe("strict-mode schema adaptation", () => {
  it("the real generation schema does contain keywords strict mode rejects", () => {
    // If this ever stops being true the adapter is dead weight — but until
    // then, it is the reason OpenAI works at all.
    const found: string[] = [];
    walk(GENERATED_STORY_WITH_META_JSON_SCHEMA, (o) => {
      for (const k of BANNED) if (k in o) found.push(k);
    });
    expect(found.length).toBeGreaterThan(0);
  });

  it("strips every unsupported keyword from the generation schema", () => {
    const strict = toStrictSchema(GENERATED_STORY_WITH_META_JSON_SCHEMA as unknown as Record<string, unknown>);
    const found: string[] = [];
    walk(strict, (o) => {
      for (const k of BANNED) if (k in o) found.push(k);
    });
    expect(found).toEqual([]);
  });

  it("strips them from the extraction schema too", () => {
    const strict = toStrictSchema(EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>);
    const found: string[] = [];
    walk(strict, (o) => {
      for (const k of BANNED) if (k in o) found.push(k);
    });
    expect(found).toEqual([]);
  });

  it("marks every object closed and every property required", () => {
    const strict = toStrictSchema(GENERATED_STORY_WITH_META_JSON_SCHEMA as unknown as Record<string, unknown>);
    walk(strict, (o) => {
      if (o.type !== "object") return;
      expect(o.additionalProperties).toBe(false);
      expect(o.required).toEqual(Object.keys((o.properties as Record<string, unknown>) ?? {}));
    });
  });

  it("keeps the parts that carry meaning", () => {
    const strict = toStrictSchema(GENERATED_STORY_WITH_META_JSON_SCHEMA as unknown as Record<string, unknown>) as {
      properties: { segments: { items: { properties: Record<string, unknown> } } };
    };
    const segment = strict.properties.segments.items.properties;
    // Structure, types and enums all survive — only the bounds go.
    expect(Object.keys(segment).sort()).toEqual(
      ["l1_text", "pairs", "paragraph", "payload", "plot_critical", "target_text"].sort(),
    );
    const pair = (segment.pairs as { items: { properties: Record<string, { enum?: string[] }> } }).items.properties;
    expect(pair.granularity.enum).toEqual(["word", "phrase"]);
  });

  it("does not mutate the schema it was given", () => {
    const before = JSON.stringify(GENERATED_STORY_WITH_META_JSON_SCHEMA);
    toStrictSchema(GENERATED_STORY_WITH_META_JSON_SCHEMA as unknown as Record<string, unknown>);
    // The Anthropic path uses the same object and DOES want the bounds.
    expect(JSON.stringify(GENERATED_STORY_WITH_META_JSON_SCHEMA)).toBe(before);
  });
});
