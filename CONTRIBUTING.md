# Contributing

## Developer Certificate of Origin

Contributions are taken under the [DCO](https://developercertificate.org/)
rather than a CLA. Sign off every commit:

```bash
git commit -s -m "your message"
```

That adds `Signed-off-by: Your Name <your@email>` and certifies you wrote
the patch or otherwise have the right to submit it under Apache 2.0.

No copyright assignment is asked for. You keep your copyright.

## Before you open a PR

```bash
npm run typecheck
npm test
```

## Things that will get a PR sent back

These are project constraints, not style preferences. Each one is load-bearing:

- **A story is one aligned bilingual structure, never two texts.** If a
  change makes the target text and the English text separately editable
  or separately stored, the weave stops working.
- **Span alignment is character offsets, never repeated text.** Storing
  the phrase itself instead of its offsets breaks the moment the same
  phrase appears twice.
- **Difficulty is a client-side render over a fixed payload.** Moving the
  slider must never cause a network call. There is a test for this.
- **Nothing hardcodes a language.** Everything language-shaped lives in
  `src/lib/languages.ts`, and validation derives from `TARGET_LANGS`. A
  test fails if a language literal reappears anywhere else.
- **Audio is never a woven mixed-language track.** Every synthesis call is
  single-language by construction.
- **The API key is server-side only.** It must never reach the client, in
  any build.

## Adding a language

The honest answer: this build's language set is frozen at Spanish, French
and German, and new languages ship in the hosted service instead. That is
a product decision, not a technical limit — see the README.

If you want a language for your own use, `src/lib/languages.ts` plus a
per-language block in each of `src/prompts/{generate,generate-v2,translate}.ts`
is the whole surface. The prompt tables are typed `Record<TargetLang, …>`,
so the build tells you exactly what's missing. Note that non-Latin scripts
need a segmentation stage before the weave works at all — the alignment
model assumes whitespace-delimited words.

## Reporting bugs

A story that reads wrong is a legitimate bug and often the most useful
kind. Include the language, register, level and difficulty, and the
generated text.
