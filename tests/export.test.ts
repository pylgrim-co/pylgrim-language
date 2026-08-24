import { describe, expect, it } from "vitest";
import { cardsToAnki, cardsToCsv, csvEscape, storiesToCsv } from "../src/lib/export";
import { sampleStory } from "../src/data/sample-story";
import type { Card } from "../src/lib/schema";

const card: Card = {
  id: "c1",
  l1Text: 'she said "the bill, please"',
  targetText: "«La cuenta, por favor», dijo",
  targetLang: "es",
  region: "es-ES",
  storyId: "s1",
  segmentId: "seg1",
  createdAt: "2026-08-19T10:00:00.000Z",
};

describe("csv escaping", () => {
  it("quotes fields containing commas, quotes and newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("two\nlines")).toBe('"two\nlines"');
  });
});

describe("cards export", () => {
  it("CSV round-trips quotes and commas without corrupting columns", () => {
    const csv = cardsToCsv([card]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("target,l1,language,region,story_id,created_at");
    expect(lines[1]).toContain('"«La cuenta, por favor», dijo"');
    expect(lines[1]).toContain('"she said ""the bill, please"""');
  });

  it("Anki file carries the header directives and front/back per row", () => {
    const anki = cardsToAnki([card, { ...card, id: "c2", targetText: "hola\tmundo" }]);
    const lines = anki.trim().split("\n");
    expect(lines[0]).toBe("#separator:tab");
    expect(lines[1]).toBe("#html:false");
    expect(lines[2].split("\t")).toHaveLength(2); // front, back
    expect(lines[3]).not.toContain("\t\t"); // embedded tab stripped, no phantom field
    expect(lines[3].split("\t")).toHaveLength(2);
  });
});

describe("stories export", () => {
  it("one row per story with both full texts", () => {
    const csv = storiesToCsv([sampleStory]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Café con leche en la esquina");
    expect(lines[1]).toContain("es-ES");
    expect(lines[1]).toContain("por favor");
  });
});
