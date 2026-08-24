import { describe, expect, it } from "vitest";
import { sampleStory } from "../src/data/sample-story";
import { storySchema } from "../src/lib/schema";
import { sliceSpan } from "../src/lib/offsets";
import { weave, type Difficulty } from "../src/lib/weave";

/**
 * Work-item criterion: "a hand-authored Spanish/English story round-trips
 * through the aligned schema (offset-based spans) and renders at all five
 * difficulty levels". The deployment half lives on Vercel; this is the
 * round-trip half.
 */

describe("sample story round-trip", () => {
  it("validates against the stored-story schema", () => {
    expect(() => storySchema.parse(sampleStory)).not.toThrow();
  });

  it("kept every hand-authored pair (no drops in sanitisation)", () => {
    const pairCounts = sampleStory.rendering.segments.map((s) => s.pairs.length);
    expect(pairCounts).toEqual([2, 1, 0, 2, 2, 1, 0, 2]);
  });

  it("every span slices to non-empty text on both sides", () => {
    sampleStory.rendering.segments.forEach((rseg, i) => {
      const core = sampleStory.core.segments[i];
      for (const p of rseg.pairs) {
        expect(sliceSpan(rseg.l1Text, p.l1).length).toBeGreaterThan(0);
        expect(sliceSpan(core.targetText, p.target).length).toBeGreaterThan(0);
        expect(p.l1[1]).toBeLessThanOrEqual(rseg.l1Text.length);
        expect(p.target[1]).toBeLessThanOrEqual(core.targetText.length);
      }
    });
  });

  it("aligned pairs carry the intended text", () => {
    const seg0 = sampleStory.rendering.segments[0];
    const core0 = sampleStory.core.segments[0];
    expect(sliceSpan(seg0.l1Text, seg0.pairs[0].l1)).toBe("toasted bread");
    expect(sliceSpan(core0.targetText, seg0.pairs[0].target)).toBe("pan tostado");
  });

  it("renders at all five difficulty levels", () => {
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      const r = weave(sampleStory, d);
      expect(r.paragraphs.length).toBe(3);
      const chunkCount = r.paragraphs.flat(2).length;
      expect(chunkCount).toBeGreaterThan(0);
    }
  });

  it("difficulty 5 reassembles to exactly the full target text", () => {
    const r = weave(sampleStory, 5);
    const rendered = r.paragraphs
      .flat()
      .map((seg) => seg.map((c) => c.text).join(""))
      .join(" ");
    const full = sampleStory.core.segments.map((s) => s.targetText).join(" ");
    expect(rendered).toBe(full);
    expect(r.coverage).toBe(1);
  });

  it("scaffold reassembles each unflipped segment to its exact l1 text", () => {
    const r = weave(sampleStory, 1);
    r.paragraphs.flat().forEach((segChunks) => {
      if (segChunks.length === 1 && segChunks[0].wholeSegment) return; // flipped whole
      const segmentId = segChunks[0].segmentId;
      const rseg = sampleStory.rendering.segments.find((s) => s.segmentId === segmentId)!;
      const core = sampleStory.core.segments.find((s) => s.id === segmentId)!;
      const reassembledFromCounterparts = segChunks
        .map((c) => (c.lang === "es" ? sliceSpan(rseg.l1Text, rseg.pairs.find((p) => p.id === c.pairId)!.l1) : c.text))
        .join("");
      expect(reassembledFromCounterparts).toBe(rseg.l1Text);
      // and flipped chunks carry real target text
      segChunks
        .filter((c) => c.lang === "es" && c.pairId)
        .forEach((c) => {
          const pair = rseg.pairs.find((p) => p.id === c.pairId)!;
          expect(c.text).toBe(sliceSpan(core.targetText, pair.target));
        });
    });
  });
});
