import type { GeneratedStory, Story } from "../lib/schema";
import { toStoredStory } from "../lib/offsets";

/**
 * Hand-authored German reference story (Standard, Sie register, A2).
 * Deliberately exercises what makes German the weave stress test:
 * compound nouns pairing one German word against a multi-word English
 * phrase ("the ticket counter" ↔ "Fahrkartenschalter"), and short
 * single-clause segments so V2 order stays readable when flipped.
 */

const generated: GeneratedStory = {
  title_l1: "A Ticket to Heidelberg",
  title_target: "Eine Fahrkarte nach Heidelberg",
  segments: [
    {
      paragraph: 0,
      l1_text: "The station hall was full of morning travellers.",
      target_text: "Die Bahnhofshalle war voller Morgenreisender.",
      payload: false,
      plot_critical: false,
      pairs: [
        // compound: "The station hall" ↔ "Die Bahnhofshalle" — asymmetric widths
        { l1_words: [0, 3], target_words: [0, 2], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
      ],
    },
    {
      paragraph: 0,
      l1_text: "Jonas stepped up to the ticket counter.",
      target_text: "Jonas trat an den Fahrkartenschalter.",
      payload: false,
      plot_critical: true,
      pairs: [
        // compound: "the ticket counter." ↔ "den Fahrkartenschalter."
        { l1_words: [4, 7], target_words: [3, 5], granularity: "phrase", payload: false, frequency_rank: 1, plot_critical: false },
      ],
    },
    {
      paragraph: 1,
      l1_text: "“One return ticket to Heidelberg, please.”",
      target_text: "«Eine Rückfahrkarte nach Heidelberg, bitte.»",
      payload: true, // buying the ticket — the first objective
      plot_critical: true,
      pairs: [],
    },
    {
      paragraph: 1,
      l1_text: "The clerk asked whether he wanted to leave right away.",
      target_text: "Der Beamte fragte, ob er sofort losfahren wolle.",
      payload: false,
      plot_critical: true,
      pairs: [
        // "The clerk" ↔ "Der Beamte"
        { l1_words: [0, 2], target_words: [0, 2], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
        // "right away." ↔ "sofort" — asymmetric the other way round
        { l1_words: [8, 10], target_words: [5, 6], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
      ],
    },
    {
      paragraph: 1,
      l1_text: "“Which platform does it leave from?”",
      target_text: "«Von welchem Gleis fährt er ab?»",
      payload: true, // asking the platform — the second objective
      plot_critical: true,
      pairs: [],
    },
    {
      paragraph: 2,
      l1_text: "Platform nine, in ten minutes.",
      target_text: "Gleis neun, in zehn Minuten.",
      payload: false,
      plot_critical: true,
      pairs: [
        // "Platform nine," ↔ "Gleis neun,"
        { l1_words: [0, 2], target_words: [0, 2], granularity: "phrase", payload: false, frequency_rank: 1, plot_critical: false },
        // "ten minutes." ↔ "zehn Minuten."
        { l1_words: [3, 5], target_words: [3, 5], granularity: "phrase", payload: false, frequency_rank: 1, plot_critical: false },
      ],
    },
  ],
};

export const sampleStoryDe: Story = toStoredStory(generated, {
  id: "sample-bahnhof-heidelberg",
  targetLang: "de",
  region: "de-DE",
  register: "formal",
  level: "A2",
  objectives: ["buy a return train ticket", "ask which platform the train leaves from"],
  l1: "en",
  createdAt: "2026-08-19T00:00:00.000Z",
});
