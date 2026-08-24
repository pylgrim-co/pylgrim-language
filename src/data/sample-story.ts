import type { GeneratedStory, Story } from "../lib/schema";
import { toStoredStory } from "../lib/offsets";

/**
 * Hand-authored reference story (Peninsular Spanish, usted register, A2).
 * Authored in the word-index generation form and converted through
 * toStoredStory — the exact code path generated stories take — so the
 * round-trip test exercises the real converter, not a parallel one.
 *
 * Word spans are [startWord, endWordExclusive) over whitespace-split tokens.
 */

const generated: GeneratedStory = {
  title_l1: "Morning Coffee at the Corner Café",
  title_target: "Café con leche en la esquina",
  segments: [
    {
      paragraph: 0,
      l1_text: "The café on the corner smelled of toasted bread and fresh coffee.",
      target_text: "El café de la esquina olía a pan tostado y a café recién hecho.",
      payload: false,
      plot_critical: false,
      pairs: [
        // "toasted bread" ↔ "pan tostado"
        { l1_words: [7, 9], target_words: [7, 9], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
        // "fresh coffee." ↔ "café recién hecho."
        { l1_words: [10, 12], target_words: [11, 14], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
      ],
    },
    {
      paragraph: 0,
      l1_text: "Ana stepped up to the counter.",
      target_text: "Ana se acercó a la barra.",
      payload: false,
      plot_critical: true,
      pairs: [
        // "the counter." ↔ "la barra."
        { l1_words: [4, 6], target_words: [4, 6], granularity: "phrase", payload: false, frequency_rank: 1, plot_critical: false },
      ],
    },
    {
      paragraph: 1,
      l1_text: "“Good morning, could I have a coffee with milk, please?”",
      target_text: "«Buenos días, ¿me pone un café con leche, por favor?»",
      payload: true, // the request the user asked to learn — target language at every difficulty
      plot_critical: true,
      pairs: [],
    },
    {
      paragraph: 1,
      l1_text: "The barista asked whether she wanted it to drink in or to take away.",
      target_text: "El camarero le preguntó si lo quería para tomar aquí o para llevar.",
      payload: false,
      plot_critical: true,
      pairs: [
        // "The barista" ↔ "El camarero"
        { l1_words: [0, 2], target_words: [0, 2], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
        // "to drink in or to take away." ↔ "para tomar aquí o para llevar." — the question the user must understand
        { l1_words: [7, 14], target_words: [7, 13], granularity: "phrase", payload: true, frequency_rank: 2, plot_critical: false },
      ],
    },
    {
      paragraph: 1,
      l1_text: "“To drink in,” she said, and found a table by the window.",
      target_text: "«Para tomar aquí», dijo, y encontró una mesa junto a la ventana.",
      payload: false,
      plot_critical: false,
      pairs: [
        // "“To drink in,”" ↔ "«Para tomar aquí»," — the reply, payload
        { l1_words: [0, 3], target_words: [0, 3], granularity: "phrase", payload: true, frequency_rank: 2, plot_critical: false },
        // "a table by the window." ↔ "una mesa junto a la ventana."
        { l1_words: [7, 12], target_words: [6, 12], granularity: "phrase", payload: false, frequency_rank: 3, plot_critical: false },
      ],
    },
    {
      paragraph: 2,
      l1_text: "When the cup was empty, she caught the waiter's eye.",
      target_text: "Cuando la taza estuvo vacía, buscó la mirada del camarero.",
      payload: false,
      plot_critical: true,
      pairs: [
        // "the cup" ↔ "la taza"
        { l1_words: [1, 3], target_words: [1, 3], granularity: "word", payload: false, frequency_rank: 1, plot_critical: false },
      ],
    },
    {
      paragraph: 2,
      l1_text: "“The bill, please.”",
      target_text: "«La cuenta, por favor.»",
      payload: true, // asking for the bill — the third objective
      plot_critical: true,
      pairs: [],
    },
    {
      paragraph: 2,
      l1_text: "She left a small tip and stepped out into the bright street.",
      target_text: "Dejó una pequeña propina y salió a la calle luminosa.",
      payload: false,
      plot_critical: false,
      pairs: [
        // "a small tip" ↔ "una pequeña propina"
        { l1_words: [2, 5], target_words: [1, 4], granularity: "phrase", payload: false, frequency_rank: 2, plot_critical: false },
        // "the bright street." ↔ "la calle luminosa."
        { l1_words: [9, 12], target_words: [7, 10], granularity: "phrase", payload: false, frequency_rank: 3, plot_critical: false },
      ],
    },
  ],
};

export const sampleStory: Story = toStoredStory(generated, {
  id: "sample-cafe-madrid",
  targetLang: "es",
  region: "es-ES",
  register: "formal",
  level: "A2",
  objectives: ["order a coffee politely", "understand the barista's questions", "ask for the bill"],
  l1: "en",
  intent: "I'm going to a café in Madrid this morning and want to order, handle the staff's questions, and ask for the bill",
  createdAt: "2026-08-18T00:00:00.000Z",
});
