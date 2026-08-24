import { describe, expect, it } from "vitest";
import { sampleStory } from "../src/data/sample-story";
import { weave } from "../src/lib/weave";
import { flippableFromChunk, flipSelection, selectionSides, toggleFlip, type Flippable } from "../src/lib/flip";

/**
 * Work-item criterion (logic half): "any selection flips between languages,
 * including selections spanning multiple aligned pairs". Touch/pointer
 * behaviour is manual verification on the deployed build.
 */

const TARGET = "es";

describe("single-chunk flips", () => {
  it("toggles a pair chunk between languages", () => {
    const chunks = weave(sampleStory, 1).paragraphs.flat(2);
    const chunk = chunks.find((c) => c.pairId && c.lang === "en")!;
    const f = flippableFromChunk(chunk, TARGET)!;
    const overrides = toggleFlip({}, f);
    const after = weave(sampleStory, 1, overrides).paragraphs.flat(2);
    expect(after.find((c) => c.pairId === chunk.pairId)!.lang).toBe("es");
  });

  it("scaffold text between pairs flips the whole segment", () => {
    const chunks = weave(sampleStory, 1).paragraphs.flat(2);
    const scaffold = chunks.find((c) => !c.pairId && !c.wholeSegment && c.lang === "en")!;
    const f = flippableFromChunk(scaffold, TARGET)!;
    expect(f.key).toBe(scaffold.segmentId);
    const after = weave(sampleStory, 1, toggleFlip({}, f)).paragraphs.flat(2);
    const segChunks = after.filter((c) => c.segmentId === scaffold.segmentId);
    expect(segChunks).toHaveLength(1);
    expect(segChunks[0].lang).toBe("es");
    expect(segChunks[0].wholeSegment).toBe(true);
  });
});

describe("multi-chunk selection flips", () => {
  it("a selection spanning several aligned pairs flips them all toward the target", () => {
    const chunks = weave(sampleStory, 1).paragraphs.flat(2);
    // Take every chunk of the first segment: scaffold + two pairs.
    const segId = sampleStory.core.segments[0].id;
    const segChunks = chunks.filter((c) => c.segmentId === segId);
    expect(segChunks.length).toBeGreaterThan(1);
    const flippables = segChunks
      .map((c) => flippableFromChunk(c, TARGET))
      .filter((f): f is Flippable => f !== null);

    const overrides = flipSelection({}, flippables, TARGET);
    const after = weave(sampleStory, 1, overrides).paragraphs.flat(2);
    const afterSeg = after.filter((c) => c.segmentId === segId);
    // Scaffold flip covers the whole segment → single Spanish chunk.
    expect(afterSeg.every((c) => c.lang === "es")).toBe(true);
  });

  it("a selection already fully in the target flips back to L1", () => {
    const all = weave(sampleStory, 5).paragraphs.flat(2);
    const segId = sampleStory.core.segments[0].id;
    const segChunks = all.filter((c) => c.segmentId === segId);
    const flippables = segChunks
      .map((c) => flippableFromChunk(c, TARGET))
      .filter((f): f is Flippable => f !== null);
    const overrides = flipSelection({}, flippables, TARGET);
    const after = weave(sampleStory, 5, overrides).paragraphs.flat(2);
    expect(after.filter((c) => c.segmentId === segId).every((c) => c.lang === "en")).toBe(true);
  });

  it("mixed-language selection flips everything toward the target", () => {
    const chunks = weave(sampleStory, 3).paragraphs.flat(2);
    const segId = sampleStory.core.segments[1].id; // "Ana stepped up to the counter."
    const segChunks = chunks.filter((c) => c.segmentId === segId);
    const langs = new Set(segChunks.map((c) => c.lang));
    expect(langs.size).toBeGreaterThan(1); // freq-1 pair flipped at d3, scaffold not
    const flippables = segChunks
      .map((c) => flippableFromChunk(c, TARGET))
      .filter((f): f is Flippable => f !== null);
    const after = weave(sampleStory, 2, flipSelection({}, flippables, TARGET)).paragraphs.flat(2);
    expect(after.filter((c) => c.segmentId === segId).every((c) => c.lang === "es")).toBe(true);
  });
});

describe("card capture from selections", () => {
  it("captures both sides of a single aligned pair", () => {
    const chunks = weave(sampleStory, 1).paragraphs.flat(2);
    const chunk = chunks.find((c) => c.text === "la barra." || c.counterpart === "la barra.")!;
    const sides = selectionSides([chunk], TARGET);
    expect(sides.target).toBe("la barra.");
    expect(sides.l1).toBe("the counter.");
  });

  it("captures both sides of a whole flipped segment", () => {
    const chunks = weave(sampleStory, 5).paragraphs.flat(2);
    const bill = chunks.find((c) => c.text === "«La cuenta, por favor.»")!;
    const sides = selectionSides([bill], TARGET);
    expect(sides.target).toBe("«La cuenta, por favor.»");
    expect(sides.l1).toBe("“The bill, please.”");
  });
});
