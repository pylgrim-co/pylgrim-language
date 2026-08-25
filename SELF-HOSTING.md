# Self-hosting pylgrim

## Requirements

Node 20+ and an API key from Anthropic, OpenAI, or OpenRouter. Optionally
an Azure Speech key for audio. There is no database.

Any package manager works — npm, pnpm, yarn or bun. The docs use npm in
examples; substitute freely. No lockfile ships, so your first install
resolves fresh; commit the lockfile your manager writes if you want your
fork pinned.

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

## Choosing a provider

You pay your own inference bill here, so you get to choose who to pay.
Set one key. If several are set, or you want to be explicit, set
`PYLGRIM_PROVIDER` too.

| Provider | Key | Model | Notes |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | chosen per language, automatically | the default, and what everything was tuned against |
| OpenAI | `OPENAI_API_KEY` | `PYLGRIM_OPENAI_MODEL` (required) | needs a model supporting strict JSON schema output |
| OpenRouter | `OPENROUTER_API_KEY` | `PYLGRIM_OPENROUTER_MODEL` (required) | one key, many vendors; quality varies sharply by model |

```bash
PYLGRIM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
PYLGRIM_OPENROUTER_MODEL=<vendor>/<model>
```

**There is no default model for OpenAI or OpenRouter, deliberately.**
Model names change often enough that a baked-in default would eventually
404 on a fresh install, and that failure looks like a bug in pylgrim
rather than a stale constant. Pick one and name it.

### Picking a model

This is not a chat app, and the job is unusually specific. Every phrase
pair in a story is a **word-index span** into both languages — `[3, 5]`
against `[1, 3]` — which is what makes a phrase flip when you tap it. So
the model has to do two things beyond writing decent Spanish:

- hold a deep nested JSON schema, strictly
- count word positions accurately, over and over, across 500 words

The counting is what separates models, and it fails quietly. Pairs that
don't line up are dropped at ingest, so the story still saves, still
reads, and simply flips less.

**What to use:**

- **Anthropic** is the safe answer. It needs no model configuration, picks
  the right one per language, and is what the prompts were tuned against.
- **OpenAI or OpenRouter**: use a current frontier model and check it
  supports strict JSON schema output. Cheap, small and older models are
  where alignment falls apart.
- On **OpenRouter**, the model you name matters far more than OpenRouter
  does — it's a router, so quality is entirely whatever you routed to.

You don't have to guess whether it's working. If too much of a story's
alignment fails, pylgrim regenerates once, and if the second attempt is no
better it saves the story and tells you the model is struggling. **Seeing
that warning more than occasionally means switch model**, not that
something is broken.

The header shows which provider and model you're on.

## Where your data lives

**In your browser.** IndexedDB is the primary store — stories, cards,
review history, activity. Not a cache over a server; there is no server.

Two consequences worth understanding before you rely on it:

- **Clearing site data deletes everything.** Export regularly (CSV or
  Anki) — that is what the export exists for.
- **It does not follow you between browsers or devices.** Cross-device
  sync needs a server to sync to, which this build deliberately does not
  have.

Audio is cached on disk under `.pylgrim-cache/audio/`, content-addressed
on (text, language, voice). Deleting it is safe; it costs one
re-synthesis per phrase. Per-call token counts and costs append to
`.pylgrim-cache/usage.jsonl` so you can see what you are spending:

```bash
jq -s 'map(.costUsd // 0) | add' .pylgrim-cache/usage.jsonl
```

## Privacy: what "we collect nothing" does and does not mean

There is no telemetry, no phone-home and no pool participation in this
build. Nothing is reported to pylgrim, and there is no account to report
it against.

**That is not the same as "nothing leaves your machine."** Generating a
story sends your typed intent to whichever provider you configured —
Anthropic, OpenAI, or via OpenRouter to whoever fronts the model you
chose. Synthesising audio sends the text to Microsoft. Those requests go
under *your* account and *their* terms, and pylgrim is not in the loop
either way — which also means it cannot make promises on their behalf.

OpenRouter is worth one extra thought here: it is an additional party
between you and the model vendor, with its own terms and its own
retention policy. That may be exactly what you want, or not.

If you want total isolation, this is the right build to be running, but
the provider terms are the ones that bind.

## Multi-user

Don't. This build has no authentication and no user separation: every
request is the same person, by design. Exposing it on a network means
anyone who reaches it uses your API key and reads your library.

If you need it reachable, put a real auth layer in front of it — a
reverse proxy with SSO or basic auth — rather than looking for a login
screen in the app. Bolting sessions onto local storage would be the
worse answer.

## What you don't get

The shared story pool and the seed library. They are hosted-service
assets governed by terms of service rather than the code licence, they
are not in this distribution, and there is no self-host path that reads
them. You start with an empty library and fill it by generating.

The language set is fixed at Spanish, French and German here.

## Costs

You pay your model provider and Microsoft directly. Stories target ~500
words. On the Anthropic path the model follows the language — Sonnet 5 for
Spanish and French, Fable 5 for German, whose compound nouns and V2 word
order need the better first draft. On OpenAI or OpenRouter you get the one
model you configured, for every language.

Azure Speech is roughly $16/M characters, and the content-addressed cache
means a repeated phrase costs once, ever.

Note that a regeneration triggered by weak alignment costs a second
generation. A model that triggers it often is expensive twice over.

`.pylgrim-cache/usage.jsonl` has the real numbers for your usage. Trust
it over any estimate here.
