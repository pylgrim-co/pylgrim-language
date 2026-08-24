import { describe, expect, it } from "vitest";
import { sanitizePairs, sliceSpan, tokenize, wordSpanToCharSpan } from "../src/lib/offsets";
import type { SpanPair } from "../src/lib/schema";

describe("tokenize", () => {
  it("finds whitespace-delimited tokens with punctuation attached", () => {
    const t = tokenize("Ana stepped up to the counter.");
    expect(t).toHaveLength(6);
    expect(t[5]).toEqual({ start: 22, end: 30 }); // "counter."
  });

  it("handles leading/trailing/multiple spaces", () => {
    const t = tokenize("  dos   palabras  ");
    expect(t).toHaveLength(2);
  });
});

describe("wordSpanToCharSpan", () => {
  const text = "Ana stepped up to the counter.";

  it("converts a word span to the covering char span", () => {
    const span = wordSpanToCharSpan(text, [4, 6]);
    expect(span).not.toBeNull();
    expect(sliceSpan(text, span!)).toBe("the counter.");
  });

  it("rejects out-of-range and empty spans", () => {
    expect(wordSpanToCharSpan(text, [4, 9])).toBeNull();
    expect(wordSpanToCharSpan(text, [3, 3])).toBeNull();
    expect(wordSpanToCharSpan(text, [-1, 2])).toBeNull();
  });

  it("handles Spanish punctuation and non-ASCII", () => {
    const es = "«Buenos días, ¿me pone un café con leche, por favor?»";
    const span = wordSpanToCharSpan(es, [2, 4]);
    expect(sliceSpan(es, span!)).toBe("¿me pone");
  });
});

function pair(id: string, l1: [number, number], target: [number, number]): SpanPair {
  return { id, l1, target, granularity: "phrase", payload: false, frequencyRank: 3, plotCritical: false };
}

describe("sanitizePairs", () => {
  it("drops pairs overlapping on the l1 side", () => {
    const kept = sanitizePairs([pair("a", [0, 10], [0, 10]), pair("b", [5, 15], [20, 30])]);
    expect(kept.map((p) => p.id)).toEqual(["a"]);
  });

  it("drops pairs overlapping on the target side", () => {
    const kept = sanitizePairs([pair("a", [0, 10], [0, 10]), pair("b", [20, 30], [5, 15])]);
    expect(kept.map((p) => p.id)).toEqual(["a"]);
  });

  it("drops inverted spans and keeps disjoint pairs sorted", () => {
    const kept = sanitizePairs([pair("c", [20, 30], [20, 30]), pair("bad", [8, 4], [0, 2]), pair("a", [0, 10], [0, 10])]);
    expect(kept.map((p) => p.id)).toEqual(["a", "c"]);
  });
});
