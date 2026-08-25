import { describe, expect, it } from "vitest";

/**
 * The standing adversarial suite (charter: pooled stories carry no
 * personal detail BY CONSTRUCTION, and the construction needs proof).
 *
 * Layer 1 (always runs): the structural argument, asserted — the shared
 * route's schema admits no intent, and pool inserts receive only what
 * canonicalisation returns. Covered in pool.test.ts.
 *
 * Layer 2 (this file, live, opt-in via PYLGRIM_LIVE=1): stuff extraction
 * with names, addresses, employers, diagnoses and court dates, and assert
 * none of it survives into the objective statements — the ONLY artifact
 * the shared path ever sees.
 */

const LIVE = process.env.PYLGRIM_LIVE === "1";

// ---------- Layer 0: the deterministic scrub, always on ----------

import { extractPersonalTokens, scrubObjectives } from "../src/lib/privacy-scrub";

describe("deterministic scrub (always runs)", () => {
  it("flags every planted identifier from every stuffed intent", () => {
    for (const { intent, identifiers } of STUFFED_INTENTS) {
      const tokens = extractPersonalTokens(intent);
      for (const p of identifiers) {
        expect([...tokens].some((t) => t === p || t.startsWith(p)), `${p} not flagged in: ${intent}`).toBe(true);
      }
    }
  });

  it("drops leaky objectives and keeps clean ones", () => {
    const intent = "tell my landlord Maria Fernandez at 14 Elm Street that I'm moving out";
    const { objectives, dropped } = scrubObjectives(
      [
        "tell a landlord you are ending a tenancy", // clean
        "tell Maria you are moving out", // leaks a name
        "give notice about 14 Elm Street", // leaks address tokens
      ],
      intent,
    );
    expect(objectives).toEqual(["tell a landlord you are ending a tenancy"]);
    expect(dropped).toHaveLength(2);
  });

  it("clean intents pass through untouched", () => {
    const { objectives, dropped } = scrubObjectives(
      ["order a coffee politely", "ask for the bill"],
      "going to a cafe this morning and want to order and pay",
    );
    expect(objectives).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });
});

// identifiers: the deterministic scrub GUARANTEES these never pass.
// sensitive: lowercase context (a diagnosis, a court matter) that only the
// extraction model can abstract away - asserted on the live pipeline,
// where prompt + scrub together are the deployed bar.
const STUFFED_INTENTS = [
  {
    intent:
      "tell my landlord Maria Fernandez at 14 Elm Street, flat 3B, that I'm moving out on the 3rd of September",
    identifiers: ["maria", "fernandez", "elm", "14", "3b", "september"],
    sensitive: [],
  },
  {
    intent:
      "explain to Dr. Okonkwo at St. Bartholomew's clinic that my epilepsy medication Keppra isn't working before my court hearing on Tuesday",
    identifiers: ["okonkwo", "keppra"],
    sensitive: ["epilepsy", "court"],
  },
  {
    intent:
      "ask my boss Janet at Deloitte Madrid for time off to visit my daughter Lucia's school, Colegio San Patricio",
    identifiers: ["janet", "deloitte", "colegio"],
    sensitive: [],
  },
];

describe.skipIf(!LIVE)("adversarial privacy: the deployed pipeline (extract + scrub)", () => {
  it("no planted token survives extraction PLUS the deterministic scrub", { timeout: 300_000 }, async () => {
    const { getProvider } = await import("../src/edition/server");
    const provider = await getProvider();
    for (const { intent, identifiers, sensitive } of STUFFED_INTENTS) {
      const extraction = await provider.extract(intent);
      // The pipeline as deployed: model best-effort, then the scrub.
      const { objectives } = scrubObjectives(extraction.objectives, intent);
      const statements = objectives.join(" ").toLowerCase();
      for (const token of [...identifiers, ...sensitive]) {
        expect(statements, `"${token}" leaked from: ${intent}`).not.toContain(token);
      }
    }
  });
});

describe.skipIf(LIVE)("adversarial privacy (live layer off)", () => {
  it.skip("set PYLGRIM_LIVE=1 to run extraction-stripping proofs against a real provider", () => {});
});
