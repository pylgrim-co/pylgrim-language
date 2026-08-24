import { describe, expect, it } from "vitest";
import { sampleStory } from "../src/data/sample-story";
import { weave, type Difficulty } from "../src/lib/weave";

/**
 * Work-item criterion: "a test asserts objective-payload spans are in
 * Spanish at difficulty 1". The weave is a pure function — its zero-network
 * property is structural (no fetch, no async anywhere in the module), and
 * its determinism is asserted below.
 */

describe("payload invariance", () => {
  for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
    it(`payload renders in the target language at difficulty ${d}`, () => {
      const r = weave(sampleStory, d);
      const chunks = r.paragraphs.flat(2);

      // Payload SEGMENTS render whole, in Spanish.
      for (const seg of sampleStory.core.segments.filter((s) => s.payload)) {
        const segChunks = chunks.filter((c) => c.segmentId === seg.id);
        expect(segChunks).toHaveLength(1);
        expect(segChunks[0].lang).toBe("es");
        expect(segChunks[0].text).toBe(seg.targetText);
      }

      // Payload PAIRS render in Spanish wherever their segment is scaffold.
      sampleStory.rendering.segments.forEach((rseg) => {
        for (const pair of rseg.pairs.filter((p) => p.payload)) {
          const chunk = chunks.find((c) => c.pairId === pair.id);
          if (chunk) expect(chunk.lang).toBe("es"); // absent only if whole segment flipped to es
          else {
            const segChunk = chunks.find((c) => c.segmentId === rseg.segmentId && c.wholeSegment);
            expect(segChunk?.lang).toBe("es");
          }
        }
      });
    });
  }
});

describe("coverage and determinism", () => {
  it("coverage is monotonically non-decreasing across difficulties", () => {
    let prev = -1;
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      const { coverage } = weave(sampleStory, d);
      expect(coverage).toBeGreaterThanOrEqual(prev);
      prev = coverage;
    }
  });

  it("difficulty 5 is full coverage; difficulty 1 is payload plus little else", () => {
    expect(weave(sampleStory, 5).coverage).toBe(1);
    const d1 = weave(sampleStory, 1).coverage;
    expect(d1).toBeGreaterThan(0); // payload is always present
    expect(d1).toBeLessThan(0.5);
  });

  it("selection is deterministic: identical calls render identically", () => {
    const a = weave(sampleStory, 3);
    const b = weave(sampleStory, 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("selection order: common items flip before rare ones once payload is in", () => {
    // At d2 the payload alone exceeds the coverage budget, so nothing else
    // flips — itself worth asserting: payload never yields to the budget.
    const d2chunks = weave(sampleStory, 2).paragraphs.flat(2);
    expect(d2chunks.find((c) => c.text === "la barra.")).toBeUndefined();

    // At d3 there is headroom: the freq-1 pair flips, the freq-3 pair does not.
    const d3chunks = weave(sampleStory, 3).paragraphs.flat(2);
    expect(d3chunks.find((c) => c.text === "la barra.")).toBeDefined();
    expect(d3chunks.find((c) => c.text === "una mesa junto a la ventana.")).toBeUndefined();
  });

  it("user overrides layer over the weave in both directions", () => {
    const base = weave(sampleStory, 1);
    const chunks = base.paragraphs.flat(2);
    const flipped = chunks.find((c) => c.pairId && c.lang === "es");
    const unflipped = chunks.find((c) => c.pairId && c.lang === "en");
    expect(flipped && unflipped).toBeTruthy();

    const withOverrides = weave(sampleStory, 1, {
      [flipped!.pairId!]: "l1",
      [unflipped!.pairId!]: "target",
    });
    const after = withOverrides.paragraphs.flat(2);
    expect(after.find((c) => c.pairId === flipped!.pairId)!.lang).toBe("en");
    expect(after.find((c) => c.pairId === unflipped!.pairId)!.lang).toBe("es");
  });
});
