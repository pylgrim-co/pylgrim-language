# pylgrim

Say what you're about to do. Get back a short story that rehearses exactly
that, with the target language woven into it at whatever density you can
actually read. Tap any phrase to flip it between languages. Save the bits
worth keeping as flashcards.

The story is **one aligned bilingual structure**, not two texts side by
side. That is the whole idea: a difficulty slider re-renders the same
story from 10% target language to 100% with no new generation and no
network call, because both languages and the alignment between them are
already in the payload.

```
difficulty 1  ·  She asked for a coffee at the counter and paid in cash.
difficulty 3  ·  She asked for un café at the counter and pagó en efectivo.
difficulty 5  ·  Pidió un café en el mostrador y pagó en efectivo.
```

Spanish, French and German. Peninsular, Metropolitan and Standard
respectively — one named region each, because there is no region-neutral
Spanish and pretending otherwise produces language nobody actually speaks.

## What you get

- **Generated stories** from a typed intent, streamed, against your own
  Anthropic key
- **The weave** — character-offset span alignment, so any selection flips,
  including selections spanning several aligned pairs
- **Dialogue tiers** — one English narrative with five dialogue tracks at
  escalating difficulty, for the "understand what was said, and answer"
  problem that reading alone doesn't solve
- **Spaced review** (FSRS) over cards you save out of stories
- **Audio** per phrase and per story, through your own Azure Speech key,
  content-addressed so a repeated phrase is synthesised once ever
- **Export** to CSV and Anki
- **Local-first** — IndexedDB is the primary store, not a cache. It works
  offline and survives a browser restart.

## Running it

```bash
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev
```

That's it. No database, no accounts, no sign-in — see
[SELF-HOSTING.md](SELF-HOSTING.md) for what that means and what it costs
you.

## What this build does not have

No accounts, no payments, and no story pool.

The first two are absent because a single-user local app has no use for
them. The third is a deliberate product boundary and worth being straight
about: pylgrim also runs as a hosted service, and the **shared story pool
— every story other people have generated, plus a curated seed library —
is what you pay that service for.** The pool is content governed by terms
of service, not code governed by this licence, and it is not part of this
distribution.

So the honest summary is: every feature here works, against your own
content and your own provider keys. You start with an empty library and
pay your own inference for every story. The hosted service starts you with
a full one.

The language set is also fixed at Spanish, French and German in this
build. New languages land in the hosted service.

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) covers the aligned schema, the offset
model, and the edition seam that produces this build.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Contributions are taken under a
Developer Certificate of Origin — one `Signed-off-by` line per commit.

## Licence

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
