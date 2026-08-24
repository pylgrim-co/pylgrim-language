# Self-hosting pylgrim

## Requirements

Node 20+ and an Anthropic API key. Optionally an Azure Speech key for
audio. There is no database.

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

## Configuration

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Generation, objective extraction and translation |
| `AZURE_SPEECH_KEY` | no | Audio. Without it, audio degrades with a clear message |
| `AZURE_SPEECH_ENDPOINT` | with key | e.g. `https://<resource>.cognitiveservices.azure.com` |
| `AZURE_SPEECH_REGION` | alt | e.g. `westeurope` — use instead of endpoint |

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
story sends your typed intent to Anthropic. Synthesising audio sends the
text to Microsoft. Those requests go under *your* account and *their*
terms, and pylgrim is not in the loop either way — which also means it
cannot make promises on their behalf.

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

You pay Anthropic and Microsoft directly. Stories target ~500 words;
generation runs on Sonnet 5 for Spanish and French and Fable 5 for German
(compound nouns and V2 word order need the better first draft). Azure
Speech is roughly $16/M characters, and the content-addressed cache means
a repeated phrase costs once, ever.

`.pylgrim-cache/usage.jsonl` has the real numbers for your usage. Trust
it over any estimate here.
