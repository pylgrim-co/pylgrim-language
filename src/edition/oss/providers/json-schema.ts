/**
 * JSON Schema → OpenAI strict-mode schema.
 *
 * Strict structured output accepts a deliberately small subset of JSON
 * Schema. Our generation schema uses four keywords outside it —
 * `minimum`, `maximum`, `minItems`, `maxItems` — which strict mode rejects
 * outright rather than ignoring, so the request fails before the model
 * sees it.
 *
 * Stripping them is safe because they were never the real gate. Every
 * generated document is parsed by `generatedStorySchema` (zod) before
 * anything stores it, and the alignment spans are re-checked against the
 * actual text in offsets.ts. The provider schema steers the model; zod
 * decides what counts.
 *
 * What strict mode also demands, and this enforces: every property listed
 * in `required`, and `additionalProperties: false` on every object. Our
 * schema already satisfies both, but a future edit might not, and a
 * missing `required` entry fails at the API rather than in review.
 */

const UNSUPPORTED = ["minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "default"];

type Schema = Record<string, unknown>;

export function toStrictSchema(schema: Schema): Schema {
  const out: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED.includes(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      const props: Schema = {};
      for (const [name, sub] of Object.entries(value as Schema)) {
        props[name] = toStrictSchema(sub as Schema);
      }
      out.properties = props;
      continue;
    }
    if (key === "items" && value && typeof value === "object") {
      out.items = toStrictSchema(value as Schema);
      continue;
    }
    out[key] = value;
  }

  if (out.type === "object") {
    out.additionalProperties = false;
    // Strict mode requires EVERY property to be required. Ours already are;
    // this keeps that true if the schema grows.
    out.required = Object.keys((out.properties as Schema) ?? {});
  }
  return out;
}
