/**
 * Dev utility: validate a captured /api/v1/generate NDJSON stream through
 * the real schema, offset converter and weave. Usage:
 *   npx tsx src/scripts/validate-live-story.ts <path-to-ndjson>
 */
import { readFileSync } from "fs";
import { generatedStorySchema } from "../lib/schema";
import { toStoredStory } from "../lib/offsets";
import { weave, type Difficulty } from "../lib/weave";

const path = process.argv[2];
if (!path) {
  console.error("usage: tsx src/scripts/validate-live-story.ts <ndjson file>");
  process.exit(1);
}

const lines = readFileSync(path, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { t: string; text?: string; data?: unknown });

const full = lines.find((l) => l.t === "full");
const buffer = lines.filter((l) => l.t === "delta").map((l) => l.text).join("");
const doc: unknown = full ? full.data : JSON.parse(buffer);

const gen = generatedStorySchema.parse(doc);
const authored = gen.segments.reduce((n, s) => n + s.pairs.length, 0);
const story = toStoredStory(gen, {
  id: "live-test",
  targetLang: "es",
  region: "es-ES",
  register: "formal",
  level: "A2",
  objectives: ["(from stream)"],
  l1: "en",
  createdAt: new Date().toISOString(),
});
const kept = story.rendering.segments.reduce((n, s) => n + s.pairs.length, 0);

console.log("schema: VALID");
console.log("segments:", gen.segments.length, "| scaffold words:", gen.segments.reduce((n, s) => n + s.l1_text.split(/\s+/).length, 0));
console.log("pairs authored:", authored, "| kept after offset validation:", kept, "| dropped:", authored - kept);
console.log("payload segments:", gen.segments.filter((s) => s.payload).length);
for (const d of [1, 3, 5] as Difficulty[]) {
  console.log(`d${d} coverage: ${Math.round(weave(story, d).coverage * 100)}%`);
}
console.log("title:", gen.title_target);
console.log("sample:", gen.segments[1]?.target_text.slice(0, 90));
