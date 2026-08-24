# Adding a language

This build ships Spanish, French and German. Adding a fourth is four files
and no architecture — the type system tells you what is missing at every
step, and the test suite refuses a half-finished one.

Read [the note at the end](#will-this-be-merged-upstream) first if you were
planning to send it back as a PR.

## What a language actually is

Everything language-shaped lives in `src/lib/languages.ts` and three prompt
files. There is no registry to wire up, no migration, no config file.

| File | What it needs |
|---|---|
| `src/lib/languages.ts` | the language itself: name, region, register labels, model, voices |
| `src/prompts/generate.ts` | how to write the weave in it |
| `src/prompts/generate-v2.ts` | how to write dialogue tiers in it |
| `src/prompts/translate.ts` | how to translate into it |

All four tables are typed `Record<TargetLang, …>`, so the moment you add to
`TARGET_LANGS` the compiler lists every block you still owe. Work through
the errors and you are done.

## 1. Declare it

In `src/lib/languages.ts`, three edits.

```ts
export const TARGET_LANGS = ["es", "fr", "de", "it"] as const;
export const REGIONS = ["es-ES", "fr-FR", "de-DE", "it-IT"] as const;
```

Then an entry in `LANGUAGES`:

```ts
it: {
  code: "it",
  name: "Italian",
  region: "it-IT",
  regionLabel: "Italy (Standard)",
  registerLabels: { formal: "Lei — polite", informal: "tu — informal", neutral: "neutral" },
  model: "claude-sonnet-5",
  voices: [
    { id: "it-IT-IsabellaMultilingualNeural", label: "Isabella — warm" },
    { id: "it-IT-DiegoNeural", label: "Diego — classic" },
  ],
},
```

Three things worth getting right rather than guessing:

**One region, and name it.** `region` is a single value, not a list, and
that is deliberate: there is no region-neutral Spanish and no region-neutral
anything else. Pick the variety you actually want — Peninsular, Metropolitan,
Rioplatense — and say so in `regionLabel`. The whole prompt hangs off it.

**Register is your language's address system.** The generic
formal/informal/neutral maps onto usted/tú, vous/tu, Sie/du. Give it the
real pronoun in `registerLabels`; that string is what the reader sees in
the selector.

**Voices are cache partitions.** Every voice is its own audio cache, so a
long list fragments it. Two to four is right. Ids must carry the locale
prefix — the accent follows the region structurally, and
`resolveVoice()` clamps anything unrecognised back to the first entry.
Azure's current list: `az cognitiveservices account list-voices`, or the
[voice gallery](https://speech.microsoft.com/portal/voicegallery).

`model` picks the generation model. Sonnet 5 is the default; German runs on
Fable 5 because compound nouns and V2 word order need a better first draft.
If your language has structural awkwardness for span alignment, spend the
tokens.

## 2. Write the prompts

Now `npm run typecheck` will name every missing block. Three files.

**`src/prompts/generate.ts`** — `TARGET_BLOCKS` is the one that matters
most. Be specific about the variety, with concrete lexical choices rather
than adjectives, because that is what the model can act on:

```ts
it: `TARGET LANGUAGE: Italian as spoken in Italy (Standard). Everyday
spoken Italian: natural use of the passato prossimo over the passato
remoto, standard vocabulary, no regional forms.`,
```

Compare the Spanish entry — "camarero not mesero, coger is fine, vosotros
where plural-informal address occurs" — that level of specificity is the
point. "Natural Italian" tells the model nothing.

`REGISTER_BLOCKS` needs all three of formal, informal and neutral. Say what
happens in service interactions specifically; that is where languages
differ most and where the model most often gets it wrong. (French: `tu` with
a stranger behind a counter is simply incorrect, so the informal block says
so.)

`ALIGNMENT_NOTES` is optional — only German has one. Add an entry if your
language has a mechanical property that fights word-index alignment:
compound nouns, separable verbs, clitic clusters, heavy inflection that
makes one word answer to three.

**`src/prompts/generate-v2.ts`** — `TARGET_LINES` and `REGISTER_LINES`, the
same content compressed to a line each. This prompt produces five dialogue
tiers in one call, so it is already long.

**`src/prompts/translate.ts`** — same shape again.

## 3. Prove it

```bash
npm run typecheck
npm test
```

`tests/languages.test.ts` iterates `TARGET_LANGS` and builds all three
prompts for each. It fails if a block is missing, empty, or does not name
your language — the failure mode it exists to prevent is a prompt with no
target block, which still generates a perfectly good story in the wrong
language, with no error anywhere.

Then generate a few stories and read them. The tests prove the plumbing;
only reading proves the language. Check the register actually holds through
a service interaction, and that flipping a span mid-sentence gives you
something a person would say.

Optionally add a fixture — copy `src/data/sample-story-fr.ts`, hand-author
an aligned story, and add it to the `SAMPLES` array in
`tests/languages.test.ts`. That buys you round-trip and
payload-invariance coverage at all five difficulty levels.

## Non-Latin scripts

Chinese, Japanese, Korean, Arabic and similar need more than a language
entry, and the gap is mechanical rather than pedagogical.

The weave assumes **whitespace-delimited words**. Alignment spans are word
indices at generation and character offsets in storage, both of which
presuppose that splitting on whitespace yields words. Without word
boundaries there is nothing to index, so those languages need a
segmentation stage before the core mechanic works at all — plus a reading-aid
layer (furigana, pinyin, tone marks) that is a whole rendering concern of
its own.

That is a different product surface, not a config entry. Adding one to
`TARGET_LANGS` will typecheck and produce stories that flip incorrectly.

## Will this be merged upstream?

Probably not, and it is better to say so before you spend a weekend on it.

This repository is a **snapshot at roughly MVP parity** with the hosted
product, not a continuously maintained mirror of it. Updates land
sometimes; keeping pace is explicitly not a goal, and the shipped language
set is fixed at Spanish, French and German. New languages go into the
hosted service, where each one also carries a seed library, a curated
region and narration voices — the expensive parts.

So: fork it, add your language, keep it. Divergence is the expected outcome
here rather than a failure. Everything above works, the tests are yours,
and nothing in the build is trying to stop you.

Bug reports are a different matter and genuinely welcome — especially "this
story reads wrong", which is the hardest class to find from the inside. See
[CONTRIBUTING.md](CONTRIBUTING.md).
