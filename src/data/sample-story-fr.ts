import type { GeneratedStory, Story } from "../lib/schema";
import { toStoredStory } from "../lib/offsets";

/**
 * Hand-authored French reference story (Metropolitan, vous register, A2).
 * Same word-index authoring and converter path as the Spanish sample.
 */

const generated: GeneratedStory = {
  title_l1: "A Baguette on the Rue des Martyrs",
  title_target: "Une baguette rue des Martyrs",
  segments: [
    {
      paragraph: 0,
      l1_text: "The bakery smelled of warm bread.",
      target_text: "La boulangerie sentait le pain chaud.",
      payload: false,
      plot_critical: false,
      pairs: [
        // "warm bread." ↔ "le pain chaud."
        { l1_words: [4, 6], target_words: [3, 6], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
      ],
    },
    {
      paragraph: 0,
      l1_text: "Claire waited in the queue.",
      target_text: "Claire attendait dans la file.",
      payload: false,
      plot_critical: true,
      pairs: [
        // "the queue." ↔ "la file."
        { l1_words: [3, 5], target_words: [3, 5], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
      ],
    },
    {
      paragraph: 1,
      l1_text: "“Good morning, a baguette please.”",
      target_text: "«Bonjour, une baguette, s'il vous plaît.»",
      payload: true, // ordering politely — the first objective
      plot_critical: true,
      pairs: [],
    },
    {
      paragraph: 1,
      l1_text: "The baker asked if she wanted anything else.",
      target_text: "Le boulanger lui a demandé si elle voulait autre chose.",
      payload: false,
      plot_critical: true,
      pairs: [
        // "The baker" ↔ "Le boulanger"
        { l1_words: [0, 2], target_words: [0, 2], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
        // "anything else." ↔ "autre chose."
        { l1_words: [6, 8], target_words: [8, 10], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
      ],
    },
    {
      paragraph: 1,
      l1_text: "“How much is it?” — “One euro ten.”",
      target_text: "«C'est combien?» — «Un euro dix.»",
      payload: true, // asking the price — the second objective
      plot_critical: true,
      pairs: [],
    },
    {
      paragraph: 2,
      l1_text: "She paid, smiled, and stepped out into the street.",
      target_text: "Elle a payé, souri, et est sortie dans la rue.",
      payload: false,
      plot_critical: false,
      pairs: [
        // "the street." ↔ "la rue."
        { l1_words: [7, 9], target_words: [8, 10], granularity: "phrase", payload: false, frequency_rank: 1, plot_critical: false },
      ],
    },
  ],
};

export const sampleStoryFr: Story = toStoredStory(generated, {
  id: "sample-boulangerie-paris",
  targetLang: "fr",
  region: "fr-FR",
  register: "formal",
  level: "A2",
  objectives: ["order bread politely", "ask how much something costs"],
  l1: "en",
  createdAt: "2026-08-19T00:00:00.000Z",
});
