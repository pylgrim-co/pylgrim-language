# pylgrim-language

Story-based language learning. A story is one aligned bilingual structure;
a difficulty slider re-renders it client-side from the same payload.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything in
`src/lib/weave.ts`, `src/lib/offsets.ts` or `src/lib/schema.ts`.

## Constraints

These are load-bearing. Each has a test behind it.

- A story is one aligned bilingual structure, never two texts
- Span alignment is character offsets, never repeated text
- Difficulty is a client-side render over a fixed payload — moving the
  slider must never cause a network call
- Language, region and register are structured inputs, never parsed from
  the intent text
- Nothing hardcodes a language: everything language-shaped is in
  `src/lib/languages.ts` and validation derives from `TARGET_LANGS`
- Audio is never a woven mixed-language track
- The provider API key is server-side only and never reaches the client

## This build

Open-source edition: no accounts, no billing, no story pool, no sync.
Those live behind `src/edition/` — read `src/edition/types.ts` for the
contract and `src/edition/oss/flags.ts` for what this edition has.

Languages are Spanish, French and German.

## Commands

```bash
npm run dev
npm run typecheck
npm test
```

npm is the example, not a requirement — pnpm, yarn and bun work the
same, and no lockfile is shipped.
