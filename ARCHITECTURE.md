# Architecture

## The aligned story

A story is **one structure**, not two texts. Two layers over the same
content:

- `core` — the target-language segments. This is the story as a native
  speaker would read it, and it is what audio is synthesised from.
- `rendering` — the English for each segment, plus **alignment pairs**.

A pair is two character-offset spans: one into the English text, one into
the target text. Offsets, never repeated substrings — the same phrase can
appear twice in a segment and the spans still say which occurrence.

```
segment.targetText  "Pidió un café en el mostrador"
segment.l1Text      "She asked for a coffee at the counter"
pair                l1: [14, 22]  target: [7, 13]     // "a coffee" ↔ "un café"
```

`src/lib/weave.ts` renders a difficulty level by choosing which pairs to
show in target and which in English. Every level renders from the same
stored payload, so the slider is pure client-side work — **zero network
calls**, asserted by test. Difficulty is never part of what gets stored or
generated.

`src/lib/offsets.ts` converts the model's word-index output into
character offsets at ingest, so nothing downstream has to think in words.

## Dialogue tiers (format v2)

Reading well is not the same as coping with being spoken to. A v2 story is
an **English narrative skeleton** with dialogue slots, plus **five
dialogue tracks** over the same slots at escalating conversational
difficulty — generated in one call so every tier covers the same
objectives.

Tier 5 is native colloquial speech, which is elliptical: mean turn length
can drop below tier 4 while still being harder. That is expected, not a
bug.

## Local-first

`src/lib/db.ts` — IndexedDB is the **primary store**, not a cache. Every
read the UI does comes from it. It works offline and survives a browser
restart.

The hosted edition layers sync over the top. This build has no server, so
`db.enqueue` is a no-op — without a drain, the change queue would grow
forever.

## The edition seam

This repository is generated. The hosted product is developed in a private
repo and exported from it, which is why `src/edition/` looks the way it
does.

```
src/edition/
  types.ts     the contract — one declaration of every shared type
  server.ts    re-exports ./oss/server     (hosted build: ./cloud/server)
  client.tsx   re-exports ./oss/client
  flags.ts     re-exports ./oss/flags
  oss/         this edition's implementations
```

Everything hosted — accounts, entitlement, quota, the pool, sync, usage
recording, audio storage — is reached through that seam and nowhere else.
In this build:

| Flag | | |
|---|---|---|
| `HAS_ACCOUNTS` | `false` | one user: whoever runs it |
| `HAS_BILLING` | `false` | your provider key, your bill |
| `HAS_POOL` | `false` | the shared library is a hosted asset |
| `HAS_SYNC` | `false` | no server to sync to |

Components ask `FLAGS`, never "is this the open-source build". The export
deletes the hosted implementations outright, so a hosted concern that
leaks past the seam fails the build rather than shipping quietly.

## Generation

`src/lib/provider.ts` holds the provider *contract*; which providers exist
and how one is chosen lives in `src/edition/oss/provider.ts`, because that
is an edition question. Self-hosted you get Anthropic, OpenAI, OpenRouter
and a local Claude Code development path; the hosted service runs on one
vendor and offers no choice.

`src/edition/oss/providers/openai-compatible.ts` serves both OpenAI and
OpenRouter — OpenRouter speaks the same wire format, so a second
implementation would be the same file with a different base URL. It talks
to `fetch` rather than a vendor SDK to keep the install light.

A provider answers `modelFor()` for its own jobs. Callers never compute a
model name: a route that assumed an Anthropic id while an OpenAI provider
ran would record a plausible lie in the usage log.

Generation is two stages. **Extract** turns a typed intent into a list of
learning objectives, in English, on Haiku. **Generate** writes the story
from those objectives plus your own specifics, streaming NDJSON so the
first readable content arrives in seconds rather than at the end.

Generated alignment is checked, not trusted. `alignmentReport()` in
`src/lib/offsets.ts` counts how many of the model's proposed phrase pairs
actually survived ingest; below `ALIGNMENT_FLOOR` the app regenerates once
and then warns. Dropping a bad pair costs a flip and never correctness,
which is exactly what makes it the failure worth measuring — a weak model
otherwise produces stories that read fine and barely flip.

Prompts live in `src/prompts/` and are versioned in the repo — they are
the most-iterated artifact in the product. Their per-language tables are
typed `Record<TargetLang, …>`, so adding a language fails the build until
its prompts exist.

## Languages

`src/lib/languages.ts` is the only place a language is described: name,
region, register labels, generation model, curated voices. Validation
schemas derive from `TARGET_LANGS`; a test fails if a language literal
reappears anywhere else.

One named region per language, as a scalar rather than a list. There is
no region-neutral Spanish, and the type refuses to pretend otherwise.

## Audio

Never a woven mixed-language track — every synthesis call is
single-language by construction, and narration input is built from `core`
so the English cannot reach it.

Clips are content-addressed on (text, language, voice) and cached under
`.pylgrim-cache/audio/`, served back by `/api/v1/audio/[...path]`. A
repeated phrase is synthesised once, ever.
