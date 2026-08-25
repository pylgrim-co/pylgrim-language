/**
 * Work-item criterion 6: generate 20 stories against the real schema and
 * record usage.output_tokens, replacing the PLAN.md §10.7 estimate
 * (~3,400 output tokens per 500-word story) with measured figures.
 *
 *   npm run measure                       — uses the resolved provider
 *   PYLGRIM_PROVIDER=claude-code npm run measure
 *   ANTHROPIC_API_KEY=... npm run measure — API path (~$1 at list price)
 *
 * Output tokens measure schema verbosity, so the numbers are valid from
 * either provider (both run Sonnet 5). On the subscription path they cost
 * plan quota rather than dollars. Runs sequentially to stay polite.
 */

import { generatedStorySchema } from "../lib/schema";
import { getProvider, resolveProvider } from "../edition/server";

import { toStoredStory } from "../lib/offsets";

const INTENTS = [
  "I'm going to a café in Madrid this morning and want to order, handle the staff's questions, and ask for the bill",
  "buying stamps and posting a parcel at a Spanish post office",
  "checking into a small hotel in Seville late at night",
  "asking a pharmacist for something for a headache and understanding the dosage instructions",
  "ordering tapas for a group and asking what's in each dish because one of us is vegetarian",
  "taking a taxi from the airport and making sure the driver uses the meter",
  "returning a shirt to a clothes shop without a receipt",
  "asking for directions to the cathedral and understanding the answer",
  "opening conversation with my new neighbours in the lift",
  "buying fruit and veg at a market stall and understanding prices per kilo",
  "renting a car and asking about insurance excess",
  "telling a waiter about a nut allergy before ordering",
  "asking at the train station about the next train to Toledo and buying a return ticket",
  "getting a SIM card and explaining I need data only",
  "making a doctor's appointment by phone for a sore throat",
  "asking my landlord to fix the heating in my flat",
  "understanding the barber and asking for a trim, not too short",
  "complaining politely that my hotel room is noisy and asking to change rooms",
  "asking in a bookshop for a novel that's easy to read in Spanish",
  "small talk about the weather and weekend plans with colleagues at lunch",
];

async function main() {
  const providerName = resolveProvider();
  const provider = await getProvider(providerName);
  process.stderr.write(`provider: ${providerName}\n`);

  const rows: {
    intent: string;
    objectives: number;
    genIn: number;
    genOut: number;
    words: number;
    segments: number;
    droppedPairs: number;
    schemaOk: boolean;
  }[] = [];

  for (const [i, intent] of INTENTS.entries()) {
    process.stderr.write(`[${i + 1}/${INTENTS.length}] ${intent.slice(0, 60)}...\n`);

    const extraction = await provider.extract(intent).catch((err: unknown) => {
      process.stderr.write(`  extraction failed: ${err instanceof Error ? err.message : err}\n`);
      return null;
    });
    if (!extraction || extraction.objectives.length === 0) continue;

    let jsonBuffer = "";
    let fullDoc: unknown;
    let genIn = 0;
    let genOut = 0;
    let failed = false;
    for await (const event of provider.generate({
      objectives: extraction.objectives,
      targetLang: "es",
      region: "es-ES",
      register: "formal",
      level: "A2",
    })) {
      if (event.t === "delta") jsonBuffer += event.text;
      else if (event.t === "full") fullDoc = event.data;
      else if (event.t === "usage") {
        genIn = event.input_tokens;
        genOut = event.output_tokens;
      } else if (event.t === "error") {
        process.stderr.write(`  generation failed: ${event.message}\n`);
        failed = true;
      }
    }
    if (failed) continue;

    let words = 0;
    let segments = 0;
    let droppedPairs = 0;
    let schemaOk = false;
    try {
      const parsed = generatedStorySchema.parse(fullDoc ?? JSON.parse(jsonBuffer));
      schemaOk = true;
      segments = parsed.segments.length;
      words = parsed.segments.reduce((n, s) => n + s.l1_text.split(/\s+/).length, 0);
      const authored = parsed.segments.reduce((n, s) => n + s.pairs.length, 0);
      const stored = toStoredStory(parsed, {
        id: "measure",
        targetLang: "es",
        region: "es-ES",
        register: "formal",
        level: "A2",
        objectives: extraction.objectives,
        l1: "en",
        createdAt: new Date().toISOString(),
      });
      const kept = stored.rendering.segments.reduce((n, s) => n + s.pairs.length, 0);
      droppedPairs = authored - kept;
    } catch {
      process.stderr.write("  schema validation failed, counting tokens anyway\n");
    }

    rows.push({
      intent: intent.slice(0, 40),
      objectives: extraction.objectives.length,
      genIn,
      genOut,
      words,
      segments,
      droppedPairs,
      schemaOk,
    });
  }

  console.log(JSON.stringify({ provider: providerName, rows }, null, 2));

  const outs = rows.map((r) => r.genOut).filter((n) => n > 0).sort((a, b) => a - b);
  if (outs.length === 0) {
    process.stderr.write("no successful generations\n");
    process.exit(1);
  }
  const mean = outs.reduce((a, b) => a + b, 0) / outs.length;
  const median = outs[Math.floor(outs.length / 2)];
  console.error(`\nstories: ${rows.length} (schema-valid: ${rows.filter((r) => r.schemaOk).length})`);
  console.error(`generation output tokens — mean ${Math.round(mean)}, median ${median}, min ${outs[0]}, max ${outs[outs.length - 1]}`);
  console.error(`PLAN.md §10.7 assumed ~3,400 output tokens per 500-word story.`);
  const wordCounts = rows.filter((r) => r.schemaOk).map((r) => r.words);
  const inBand = wordCounts.filter((w) => w >= 300 && w <= 600).length;
  console.error(
    `scaffold words — mean ${Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)}, min ${Math.min(...wordCounts)}, max ${Math.max(...wordCounts)} | in the 300-600 acceptance band: ${inBand}/${wordCounts.length}`,
  );
  console.error(`total dropped alignment pairs: ${rows.reduce((a, r) => a + r.droppedPairs, 0)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
