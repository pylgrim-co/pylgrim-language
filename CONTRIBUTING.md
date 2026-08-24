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

## What this repository is

A snapshot at roughly MVP parity with the hosted product — a complete
application, not a continuously maintained mirror. Updates land sometimes;
keeping pace with the hosted app is explicitly not a goal.

Worth knowing before you invest in a large PR: it probably will not be
merged and maintained. That is not a judgement on the patch. Forking and
diverging is the expected outcome here, and the build does nothing to
discourage it.

Small fixes, bug reports and documentation corrections are a different
matter and are genuinely welcome.

## Adding a language

Documented properly in [ADDING-A-LANGUAGE.md](ADDING-A-LANGUAGE.md): four
files, no architecture, and the compiler lists what is missing as you go.

The shipped set is fixed at Spanish, French and German and new languages go
into the hosted service, so this is written for you to fork and keep rather
than to send back. Everything you need is here and the tests come with it.

## Reporting bugs

A story that reads wrong is a legitimate bug and often the most useful
kind. Include the language, register, level and difficulty, and the
generated text.
