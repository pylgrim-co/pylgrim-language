import { describe, expect, it } from "vitest";
import { sampleStory } from "../src/data/sample-story";
import { sampleStoryFr } from "../src/data/sample-story-fr";
import { sampleStoryDe } from "../src/data/sample-story-de";
import { storySchema, generationInputSchema } from "../src/lib/schema";
import { sliceSpan } from "../src/lib/offsets";
import { weave, type Difficulty } from "../src/lib/weave";
import { anthropicModelFor } from "../src/lib/provider";
import { generateSystem } from "../src/prompts/generate";
import { generateV2System } from "../src/prompts/generate-v2";
import { translateSystem } from "../src/prompts/translate";
import { LANGUAGES, OSS_LANGUAGES, TARGET_LANGS, targetLangSchema, regionSchema, registerSchema, REGIONS, REGISTERS } from "../src/lib/languages";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Work-item criteria: French and German render at all five levels through
 * the same round-trip and payload-invariance rules as Spanish; nothing is
 * hardcoded to Spanish; German runs on Fable 5.
 */

const SAMPLES = [
  { name: "Spanish", story: sampleStory, lang: "es" },
  { name: "French", story: sampleStoryFr, lang: "fr" },
  { name: "German", story: sampleStoryDe, lang: "de" },
];

describe.each(SAMPLES)("$name sample story", ({ story, lang }) => {
  it("validates and kept every hand-authored pair", () => {
    expect(() => storySchema.parse(story)).not.toThrow();
    story.rendering.segments.forEach((rseg, i) => {
      const core = story.core.segments[i];
      for (const p of rseg.pairs) {
        expect(sliceSpan(rseg.l1Text, p.l1).length).toBeGreaterThan(0);
        expect(sliceSpan(core.targetText, p.target).length).toBeGreaterThan(0);
        expect(p.target[1]).toBeLessThanOrEqual(core.targetText.length);
      }
    });
  });

  it("renders at all five difficulty levels with invariant payload", () => {
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      const r = weave(story, d);
      const chunks = r.paragraphs.flat(2);
      expect(chunks.length).toBeGreaterThan(0);
      for (const seg of story.core.segments.filter((s) => s.payload)) {
        const segChunks = chunks.filter((c) => c.segmentId === seg.id);
        expect(segChunks).toHaveLength(1);
        expect(segChunks[0].lang).toBe(lang);
        expect(segChunks[0].text).toBe(seg.targetText);
      }
    }
  });

  it("difficulty 5 reassembles to exactly the full target text", () => {
    const r = weave(story, 5);
    const rendered = r.paragraphs
      .flat()
      .map((seg) => seg.map((c) => c.text).join(""))
      .join(" ");
    expect(rendered).toBe(story.core.segments.map((s) => s.targetText).join(" "));
  });
});

describe("German-specific alignment", () => {
  it("compound-noun pairs are asymmetric and slice correctly", () => {
    const rseg = sampleStoryDe.rendering.segments[1];
    const core = sampleStoryDe.core.segments[1];
    const pair = rseg.pairs[0];
    expect(sliceSpan(rseg.l1Text, pair.l1)).toBe("the ticket counter.");
    expect(sliceSpan(core.targetText, pair.target)).toBe("den Fahrkartenschalter.");
  });
});

describe("nothing hardcoded to Spanish", () => {
  it("the input schema accepts all three language/region pairs", () => {
    for (const [targetLang, region] of [
      ["es", "es-ES"],
      ["fr", "fr-FR"],
      ["de", "de-DE"],
    ] as const) {
      expect(() =>
        generationInputSchema.parse({ intent: "buy bread", targetLang, region, register: "formal", level: "A2" }),
      ).not.toThrow();
    }
  });

  it("German generates on Fable 5; Spanish and French on Sonnet 5 (charter)", () => {
    expect(anthropicModelFor("de")).toBe("claude-fable-5");
    expect(anthropicModelFor("es")).toBe("claude-sonnet-5");
    expect(anthropicModelFor("fr")).toBe("claude-sonnet-5");
  });

  it("each language gets its own prompt block, register system and alignment notes", () => {
    const es = generateSystem({ targetLang: "es", region: "es-ES", register: "formal", level: "A2" });
    const fr = generateSystem({ targetLang: "fr", region: "fr-FR", register: "formal", level: "A2" });
    const de = generateSystem({ targetLang: "de", region: "de-DE", register: "formal", level: "A2" });
    expect(es).toContain("usted");
    expect(es).toContain("camarero not mesero");
    expect(fr).toContain("vous");
    expect(fr).toContain("soixante-dix");
    expect(de).toContain("Sie forms");
    expect(de).toContain("Compound nouns");
    expect(de).toContain("Separable verbs");
    // No cross-contamination.
    expect(fr).not.toContain("usted");
    expect(de).not.toContain("vosotros");
  });
});

/**
 * The language set is single-source. Two rules keep it that way, and both
 * are structural rather than conventions someone has to remember:
 *
 *  - Validation DERIVES from TARGET_LANGS. The literal ["es","fr","de"]
 *    used to be copy-pasted into nine schemas; a tenth would have been
 *    missed. Now there is one list.
 *  - Prompt builders THROW on an unknown language. Emitting a prompt with
 *    no TARGET block still generates a story — in the wrong language, with
 *    no error. That is the failure this test exists to prevent.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("the language set is declared exactly once", () => {
  it("validation derives from TARGET_LANGS, not a repeated literal", () => {
    expect(targetLangSchema.options).toEqual([...TARGET_LANGS]);
    expect(regionSchema.options).toEqual([...REGIONS]);
    expect(registerSchema.options).toEqual([...REGISTERS]);
  });

  it("no source file re-declares the language or region literal", () => {
    const files = [...sourceFiles("src"), ...sourceFiles("app")].filter(
      (f) => !f.endsWith(join("src", "lib", "languages.ts")),
    );
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /z\.enum\(\[\s*"es"\s*,|z\.enum\(\[\s*"es-ES"\s*,|z\.enum\(\[\s*"formal"\s*,/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("every language in TARGET_LANGS has a complete prompt set", () => {
    for (const lang of TARGET_LANGS) {
      const params = { targetLang: lang, region: LANGUAGES[lang].region, register: "neutral", level: "A2" };
      for (const build of [generateSystem, generateV2System, translateSystem]) {
        const prompt = build(params);
        expect(prompt).not.toContain("undefined");
        // The per-language block is what makes the prompt language-specific;
        // an empty one is the silent failure. Naming the language is the
        // format-agnostic proof that the block landed.
        expect(prompt).toContain(LANGUAGES[lang].name);
      }
    }
  });

  it("prompt builders throw on an unknown language rather than degrading", () => {
    const params = { targetLang: "it", region: "it-IT", register: "neutral", level: "A2" };
    expect(() => generateSystem(params)).toThrow(/unsupported target language/);
    expect(() => generateV2System(params)).toThrow(/unsupported target language/);
    expect(() => translateSystem(params)).toThrow(/unsupported target language/);
  });
});

describe("the open-source language freeze", () => {
  it("OSS_LANGUAGES is a subset of TARGET_LANGS", () => {
    for (const lang of OSS_LANGUAGES) {
      expect(TARGET_LANGS).toContain(lang);
    }
  });

  it("documents which languages are hosted-only", () => {
    // Not a failure — TARGET_LANGS is ALLOWED to grow past the OSS set.
    // This test exists so the difference is visible in test output rather
    // than discovered when someone wonders why a language never shipped.
    const hostedOnly = TARGET_LANGS.filter((l) => !(OSS_LANGUAGES as readonly string[]).includes(l));
    expect(Array.isArray(hostedOnly)).toBe(true);
  });
});
