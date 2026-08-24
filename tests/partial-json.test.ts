import { describe, expect, it } from "vitest";
import { extractArrayObjects } from "../src/lib/partial-json";

interface Seg {
  l1_text: string;
  target_text: string;
}

const FULL = JSON.stringify({
  title_l1: "T",
  title_target: "T",
  segments: [
    { l1_text: "One.", target_text: "Uno." },
    { l1_text: 'She said "hola, {amigo}".', target_text: "Dijo «hola»." },
    { l1_text: "Three \\ backslash.", target_text: "Tres." },
  ],
});

describe("extractArrayObjects", () => {
  it("extracts nothing before the array appears", () => {
    expect(extractArrayObjects<Seg>('{"title_l1": "T"', "segments").items).toHaveLength(0);
  });

  it("extracts completed objects and ignores the trailing incomplete one", () => {
    const cut = FULL.indexOf("Three"); // mid-third-object
    const { items } = extractArrayObjects<Seg>(FULL.slice(0, cut), "segments");
    expect(items).toHaveLength(2);
    expect(items[0].l1_text).toBe("One.");
  });

  it("is not fooled by braces and quotes inside strings", () => {
    const cut = FULL.indexOf('"Three') + 3;
    const { items } = extractArrayObjects<Seg>(FULL.slice(0, cut), "segments");
    expect(items).toHaveLength(2);
    expect(items[1].l1_text).toBe('She said "hola, {amigo}".');
  });

  it("extracts all objects from the complete document", () => {
    const { items } = extractArrayObjects<Seg>(FULL, "segments");
    expect(items).toHaveLength(3);
    expect(items[2].l1_text).toBe("Three \\ backslash.");
  });

  it("grows monotonically as the buffer grows", () => {
    let prev = 0;
    for (let i = 0; i <= FULL.length; i += 7) {
      const { items } = extractArrayObjects<Seg>(FULL.slice(0, i), "segments");
      expect(items.length).toBeGreaterThanOrEqual(prev);
      prev = items.length;
    }
    const { items } = extractArrayObjects<Seg>(FULL, "segments");
    expect(items.length).toBe(3);
    expect(items.length).toBeGreaterThanOrEqual(prev);
  });
});
