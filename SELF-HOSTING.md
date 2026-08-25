# Self-hosting pylgrim

## Requirements

Node 20+ and an API key from Anthropic, OpenAI, or OpenRouter. Optionally
an Azure Speech key for audio. There is no database.

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

### What the model actually has to do

This is not a chat app, and the requirement is unusually specific. A
generated story is one aligned bilingual structure: for every phrase pair,
the model emits **word-index spans** into both the English and the target
text — `[3, 5]` against `[1, 3]` — which are converted to character
offsets and stored. Getting them right is what makes a phrase flip.

So the model needs two things beyond writing decent Spanish:

- **Strict JSON schema adherence**, for a fairly deep nested structure.
- **Accurate counting**, repeatedly, across a 500-word story.

The second is where weaker models fall down, and it fails quietly. Pairs
whose spans do not line up are dropped at ingest — the story still saves,
still reads, and simply flips less. Anthropic models sit near-perfect.
Smaller and older models can land well under half.

pylgrim measures this rather than leaving you to notice. If too much of a
story's alignment fails, it regenerates once, and if the second attempt is
no better it saves the story with a visible warning telling you the model
is struggling. **If you see that warning repeatedly, change model** — the
app is working; the model is not up to the job.

Anthropic is preferred when several keys are set, for that reason and no
other: the prompts and the per-language model policy were tuned against
it, and it is what the alignment floor was calibrated on.

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
