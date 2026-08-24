import type { GeneratedStoryV2 } from "../lib/schema-v2";

/**
 * Hand-authored dialogue-tiers fixture (es-ES, formal). Compact on
 * purpose: two slots, five tiers, strictly ascending mean turn length,
 * every tier exercising both objectives. Word counts are load-bearing —
 * the escalation test measures them.
 */

const line = (
  speaker: string,
  isLearner: boolean,
  l1: string,
  target: string,
  payload = false,
  objectiveIndex: number | null = null,
  pairs: GeneratedStoryV2["tiers"][number]["slots"][number][number]["pairs"] = [],
) => ({
  speaker,
  is_learner: isLearner,
  l1_text: l1,
  target_text: target,
  payload,
  objective_index: objectiveIndex,
  pairs,
});

export const sampleStoryV2Gen: GeneratedStoryV2 = {
  format: "dialogue-tiers",
  title_l1: "Coffee, Then the Bill",
  title_target: "Un café y la cuenta",
  meta: { tags: ["cafe", "ordering", "paying"], topic: "ordering coffee", setting: "a Madrid café" },
  narrative: [
    { paragraph: 0, text: "The café near the office is busy this morning, and you need coffee before the day starts." },
    { paragraph: 0, slot: 0 },
    { paragraph: 1, text: "You find a seat by the window and let the morning settle around you." },
    { paragraph: 1, slot: 1 },
    { paragraph: 2, text: "Outside, the street is waking up, and so are you." },
  ],
  tiers: [
    {
      tier: 1,
      slots: [
        [
          // "A coffee, please." ↔ "Un café, por favor."
          line("You", true, "A coffee, please.", "Un café, por favor.", true, 0, [
            { l1_words: [1, 2], target_words: [1, 2], granularity: "word", payload: false, frequency_rank: 1, plot_critical: false },
          ]),
          line("Barista", false, "Anything else?", "¿Algo más?"),
        ],
        [line("You", true, "The bill, please.", "La cuenta, por favor.", true, 1)],
      ],
    },
    {
      tier: 2,
      slots: [
        [
          line("You", true, "Good morning, a coffee with milk, please.", "Buenos días, un café con leche, por favor.", true, 0),
          line("Barista", false, "Would you like anything else?", "¿Quiere algo más?"),
        ],
        [line("You", true, "Could you bring me the bill, please?", "¿Me trae la cuenta, por favor?", true, 1)],
      ],
    },
    {
      tier: 3,
      slots: [
        [
          line("You", true, "Good morning, could I have a coffee with milk, please?", "Buenos días, ¿me pone un café con leche, por favor?", true, 0),
          line("Barista", false, "Of course. Is that to drink in?", "Claro, ¿lo quiere para tomar aquí?"),
        ],
        [line("You", true, "Excuse me, could you bring us the bill when you can?", "Perdone, ¿nos trae la cuenta cuando pueda?", true, 1)],
      ],
    },
    {
      tier: 4,
      slots: [
        [
          line("You", true, "Morning! Could I get a coffee with milk, not too hot if possible?", "¡Buenos días! ¿Me pone un café con leche, que no esté muy caliente si puede ser?", true, 0),
          line("Barista", false, "Sure — we've only got oat milk left, is that alright?", "Vale, aunque solo nos queda leche de avena, ¿le viene bien así?"),
        ],
        [line("You", true, "When you get a moment, could you bring us the bill? No rush at all.", "Cuando tenga un momento, ¿nos puede traer la cuenta? Sin ninguna prisa, ¿eh?", true, 1)],
      ],
    },
    {
      tier: 5,
      slots: [
        [
          line("You", true, "Morning! Give me a white coffee when you can — and if the machine's warmed up, make it a strong one.", "¡Buenas! Ponme un café con leche cuando puedas, y si ya está caliente la máquina, me lo haces cargadito, anda.", true, 0),
          line("Barista", false, "Coming up — though I warn you, the grinder's acting up again, so it might take a couple of minutes.", "Ahora mismo te lo saco, aunque te aviso que el molinillo anda otra vez haciendo de las suyas, igual tarda un par de minutos."),
        ],
        [line("You", true, "Whenever you get a second, sort us out with the bill, will you? We're in no hurry whatsoever.", "Cuando tengas un segundo nos apañas la cuenta, ¿vale? Que no tenemos ninguna prisa, de verdad.", true, 1)],
      ],
    },
  ],
};

export const SAMPLE_V2_OBJECTIVES = ["order a coffee politely", "ask for the bill"];
