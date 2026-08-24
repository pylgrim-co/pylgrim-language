"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "motion/react";
import type { Card, GeneratedSegment, Story } from "../lib/schema";
import { generatedStorySchema } from "../lib/schema";
import { toStoredStory } from "../lib/offsets";
import { extractArrayObjects } from "../lib/partial-json";
import { db } from "../lib/db";
import { saveStory, deleteCard as deleteCardMutation } from "../lib/mutations";
import { sampleStory } from "../data/sample-story";
import { sampleStoryFr } from "../data/sample-story-fr";
import { sampleStoryDe } from "../data/sample-story-de";
import { LANGUAGES, TARGET_LANGS, type Register, type TargetLang } from "../lib/languages";
import { cardsToAnki, cardsToCsv, download, storiesToCsv } from "../lib/export";
import { weakObjectives } from "../lib/mastery";
import { playClip } from "../lib/audio-client";
import { STREAM_STAGGER } from "./motion/primitives";
import ThemeToggle from "./ThemeToggle";
import Select from "./ui/Select";
import { Sparkle, Blob } from "./ui/Doodle";
import AudioButton from "./ui/AudioButton";
import StoryReader from "./StoryReader";
import StoryReaderV2 from "./StoryReaderV2";
import Practice from "./Practice";
import { generatedStoryV2Schema, type StoryV2 } from "../lib/schema-v2";
import { toStoredStoryV2 } from "../lib/dialogue";
import Review from "./Review";
import Progress from "./Progress";
import Quiz from "./Quiz";
import Checkpoint from "./Checkpoint";
import type { PoolSuggestion } from "../edition/types";
import { CHECKPOINT_TAG } from "../lib/milestones";
import type { QuizSource } from "../lib/quiz";
import { CAP_EVENT, Explore, FLAGS, FREE_CARD_CAP, ShareFlow, UpgradePanel, poolResultToLocal, scheduleSync, signOut } from "../edition/client";
import type { Plan, SessionUser } from "../edition/types";
import Translate from "./Translate";

type Tab = "new" | "explore" | "translate" | "review" | "progress" | "library" | "cards";
type Phase = "intent" | "objectives" | "generating" | "reading" | "checkpoint";

// Register options come from the language config; nothing here is
// language-specific (charter: nothing hardcoded to Spanish).

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;

export default function App({
  initialUser,
  plan,
  canGenerate,
}: {
  initialUser: SessionUser;
  plan: Plan;
  /** whether the AI surfaces are available to this caller */
  canGenerate: boolean;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [phase, setPhase] = useState<Phase>("intent");

  // Structured inputs — never parsed from the intent text (charter).
  const [intent, setIntent] = useState("");
  const [targetLang, setTargetLang] = useState<TargetLang>("es");
  const [register, setRegister] = useState<Register>("formal");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("A2");
  const lang = LANGUAGES[targetLang];

  const [objectives, setObjectives] = useState<string[]>([]);
  const [privateMode, setPrivateMode] = useState(false);
  // Ratified direction: dialogue tiers is the default; weave stays for the
  // side-by-side verdict (Amendment A1).
  const [storyFormat, setStoryFormat] = useState<"dialogue-tiers" | "weave">("dialogue-tiers");
  const [storyV2, setStoryV2] = useState<StoryV2 | null>(null);
  const [storiesV2, setStoriesV2] = useState<StoryV2[]>([]);
  const [practiceTier, setPracticeTier] = useState<number | null>(null);
  const [quizRequest, setQuizRequest] = useState<{ source: QuizSource; difficulty: number } | null>(null);
  // The re-read moment opens a story AT a proven-higher difficulty/tier.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GeneratedSegment[]>([]);
  const [story, setStory] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [cards, setCards] = useState<Card[]>([]);

  // Account state. Reaching this component means a session exists — the
  // page redirects to /login otherwise — so the user is never null here.
  const [user] = useState<SessionUser>(initialUser);
  // What they are entitled to, resolved server-side. The UI hides paid
  // surfaces from it; the route boundary is what actually refuses them.
  const free = plan === "free";
  // AI surfaces gate on canGenerate, not on `free` directly — the card cap
  // and the account-bar badge stay keyed to `free`.

  // How many streamed segments existed before this render — only newer ones
  // get a stagger delay, so already-visible text never re-animates.
  const prevProgressLen = useRef(0);
  useEffect(() => {
    prevProgressLen.current = progress.length;
  }, [progress.length]);

  // The sample story is preloaded so the deployed page renders a real
  // aligned story before any API key exists.
  useEffect(() => {
    (async () => {
      for (const sample of [sampleStory, sampleStoryFr, sampleStoryDe]) {
        const existing = await db.getStory(sample.core.id);
        if (!existing) await db.putStory(sample);
      }
      setStories(await db.listStories());
      setStoriesV2(await db.listStoriesV2());
      setCards(await db.listCards());
    })().catch(() => setError("Local storage is unavailable in this browser"));

    // Background sync: on reconnect and on a slow heartbeat. Signed-out or
    // offline runs are no-ops; the queue holds everything.
    const onOnline = () => scheduleSync(500);
    window.addEventListener("online", onOnline);
    // The cap is enforced server-side on a background push, so the news
    // arrives out of band; surface it where errors already show.
    const onCapped = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener(CAP_EVENT, onCapped);
    const heartbeat = setInterval(() => scheduleSync(0), 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener(CAP_EVENT, onCapped);
      clearInterval(heartbeat);
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    // Signed out means out: the app has no anonymous mode to fall back to.
    window.location.href = "/login?mode=signin";
  }

  /** Server refusals carry their own wording; a status code alone is not
   *  a message a reader can act on. */
  async function refusal(res: Response, fallback: string): Promise<Error> {
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    return new Error(data.message ?? data.error ?? `${fallback} (${res.status})`);
  }

  async function refreshCards() {
    setCards(await db.listCards());
  }

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      if (!res.ok) throw await refusal(res, "extraction failed");
      const data = (await res.json()) as { objectives: string[] };
      setObjectives(data.objectives);
      setPhase("objectives");
    } catch (err) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("You're offline — generation needs a connection. Reading and review work offline.");
      } else {
        setError(err instanceof Error ? err.message : "extraction failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(overrides?: {
    objectives?: string[];
    format?: "dialogue-tiers" | "weave";
    purpose?: "standard" | "checkpoint";
  }) {
    const useObjectives = overrides?.objectives ?? objectives;
    const useFormat = overrides?.format ?? storyFormat;
    const purpose = overrides?.purpose ?? "standard";
    if (overrides?.format) setStoryFormat(overrides.format);
    if (overrides?.objectives) setObjectives(overrides.objectives);
    setBusy(true);
    setError(null);
    setProgress([]);
    setPhase("generating");
    try {
      // Private + v2 is not offered during the prototype gate.
      const usePrivate = privateMode && useFormat === "weave";
      const endpoint = usePrivate ? "/api/v1/generate/private" : "/api/v1/generate/shared";
      const payload = usePrivate
        ? { objectives: useObjectives, intent, targetLang, region: lang.region, register, level }
        : {
            objectives: useObjectives,
            targetLang,
            region: lang.region,
            register,
            level,
            format: useFormat,
            ...(purpose === "checkpoint" ? { purpose } : {}),
          };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) throw await refusal(res, "generation failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let ndjsonBuffer = "";
      let jsonBuffer = "";
      let fullDoc: unknown;
      let shown = 0;
      let poolId: string | undefined;
      let poolObjectives: string[] | null = null;
      let poolHit = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        ndjsonBuffer += decoder.decode(value, { stream: true });
        const lines = ndjsonBuffer.split("\n");
        ndjsonBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { t: string; text?: string; data?: unknown; message?: string };
          if (event.t === "delta" && event.text) {
            jsonBuffer += event.text;
            // Progressive display: completed segments render as they arrive.
            const extracted = extractArrayObjects<GeneratedSegment>(jsonBuffer, "segments");
            if (extracted.items.length > shown) {
              shown = extracted.items.length;
              setProgress(extracted.items);
            }
          } else if (event.t === "full") {
            // The provider's authoritative complete document beats the buffer.
            fullDoc = event.data;
          } else if (event.t === "pool_hit") {
            // A pooled story serves instantly — no generation at all.
            const hitEvent = event as unknown as { generated: unknown; poolId: string; objectives?: string[] };
            fullDoc = hitEvent.generated;
            poolId = hitEvent.poolId;
            poolObjectives = hitEvent.objectives ?? null;
            poolHit = true;
          } else if (event.t === "pool_saved") {
            poolId = (event as unknown as { poolId: string }).poolId;
          } else if (event.t === "objectives") {
            const canonical = (event as unknown as { canonical: string[] }).canonical;
            if (canonical?.length) setObjectives(canonical);
          } else if (event.t === "error") {
            throw new Error(event.message ?? "generation failed");
          }
        }
      }

      if (useFormat === "dialogue-tiers") {
        const genV2 = generatedStoryV2Schema.parse(fullDoc ?? JSON.parse(jsonBuffer));
        const converted = toStoredStoryV2(genV2, {
          id: crypto.randomUUID(),
          targetLang,
          region: lang.region,
          register,
          level,
          objectives: poolObjectives ?? useObjectives,
          intent: poolHit ? undefined : intent,
          createdAt: new Date().toISOString(),
        });
        const storedV2 = {
          ...converted,
          // Checkpoint stories carry their marker so milestones and the
          // library can recognise them.
          tags: purpose === "checkpoint" ? [...converted.tags, CHECKPOINT_TAG] : converted.tags,
          poolId,
        };
        // Local-only during the prototype gate: v2 does not sync yet.
        await db.putStoryV2(storedV2);
        setStoriesV2(await db.listStoriesV2());
        setStoryV2(storedV2);
        setStory(null);
        setPhase("reading");
        return;
      }
      const gen = generatedStorySchema.parse(fullDoc ?? JSON.parse(jsonBuffer));
      const stored = toStoredStory(gen, {
        id: crypto.randomUUID(),
        targetLang,
        region: lang.region,
        register,
        level,
        objectives: poolObjectives ?? useObjectives,
        l1: "en",
        // The raw intent stays local-only; pool-served stories never carry it.
        intent: poolHit ? undefined : intent,
        createdAt: new Date().toISOString(),
      });
      const saved = await saveStory({ ...stored, poolId });
      scheduleSync();
      setStories(await db.listStories());
      setStory(saved);
      setStoryV2(null);
      setPhase("reading");
    } catch (err) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("You're offline — generation needs a connection. Reading and review work offline.");
      } else {
        setError(err instanceof Error ? err.message : "generation failed");
      }
      setPhase("objectives");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate(category: string, freeText: string) {
    if (!story?.poolId || story.poolId === "contributed") return;
    const sourcePoolId = story.poolId;
    setBusy(true);
    setError(null);
    setProgress([]);
    setTab("new");
    setPhase("generating");
    try {
      const res = await fetch("/api/v1/generate/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId: sourcePoolId, category, freeText: freeText || undefined }),
      });
      if (!res.ok || !res.body) throw await refusal(res, "regeneration failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let ndjsonBuffer = "";
      let jsonBuffer = "";
      let fullDoc: unknown;
      let newPoolId: string | undefined;
      let shown = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        ndjsonBuffer += decoder.decode(value, { stream: true });
        const lines = ndjsonBuffer.split("\n");
        ndjsonBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { t: string; text?: string; data?: unknown; message?: string; poolId?: string };
          if (event.t === "delta" && event.text) {
            jsonBuffer += event.text;
            const extracted = extractArrayObjects<GeneratedSegment>(jsonBuffer, "segments");
            if (extracted.items.length > shown) {
              shown = extracted.items.length;
              setProgress(extracted.items);
            }
          } else if (event.t === "full") fullDoc = event.data;
          else if (event.t === "pool_saved") newPoolId = event.poolId;
          else if (event.t === "error") throw new Error(event.message ?? "regeneration failed");
        }
      }
      const gen = generatedStorySchema.parse(fullDoc ?? JSON.parse(jsonBuffer));
      const stored = toStoredStory(gen, {
        id: crypto.randomUUID(),
        targetLang: story.core.targetLang as TargetLang,
        region: story.core.region as (typeof LANGUAGES)[TargetLang]["region"],
        register: story.core.register,
        level: story.core.level,
        objectives: story.core.objectives,
        l1: "en",
        createdAt: new Date().toISOString(),
      });
      const saved = await saveStory({ ...stored, poolId: newPoolId });
      scheduleSync();
      setStories(await db.listStories());
      setStory(saved);
      setPhase("reading");
    } catch (err) {
      setError(err instanceof Error ? err.message : "regeneration failed");
      setPhase("reading");
    } finally {
      setBusy(false);
    }
  }

  function openStory(s: Story, atDifficulty?: number) {
    setStory(s);
    setStoryV2(null);
    setPracticeTier(null);
    setQuizRequest(null);
    setOpenAt(atDifficulty ?? null);
    setPhase("reading");
    setTab("new");
  }

  function openStoryV2(s: StoryV2, atTier?: number) {
    setStoryV2(s);
    setStory(null);
    setPracticeTier(null);
    setQuizRequest(null);
    setOpenAt(atTier ?? null);
    setPhase("reading");
    setTab("new");
  }

  /** A suggested next scenario from the pool opens like an Explore result. */
  function openPoolSuggestion(r: PoolSuggestion) {
    const opened = poolResultToLocal(r);
    if (!opened) {
      setError("that story failed to load");
      return;
    }
    if (opened.format === "dialogue-tiers") openStoryV2(opened.story);
    else openStory(opened.story);
  }

  /** "Practise my weak points": weakest objectives become the generation
   *  request, no typed intent (charter). */
  async function practiseWeakPoints() {
    const [allCards, events, allStories, allStoriesV2] = await Promise.all([
      db.listCards(),
      db.listReviewEvents(),
      db.listStories(),
      db.listStoriesV2(),
    ]);
    const weak = weakObjectives(allCards, events, allStories, allStoriesV2);
    if (weak.length === 0) {
      setError("No reviewed cards yet — review a few cards first, then this knows your weak points.");
      setTab("new");
      setPhase("intent");
      return;
    }
    setObjectives(weak);
    setTab("new");
    setPhase("objectives");
  }

  // Explore browses the shared pool, which is a hosted-service asset and
  // not part of the open-source distribution (charter:
  // self-hosters-get-no-pool-access). No pool, no tab.
  const NAV: ([Tab, string, number | null] | null)[] = [
    ["new", "Story", null],
    FLAGS.HAS_POOL ? ["explore", "Explore", null] : null,
    ["translate", "Translate", null],
    ["review", "Review", null],
    ["progress", "Progress", null],
    ["library", "Library", stories.length + storiesV2.length],
    ["cards", "Cards", cards.length],
  ];
  const nav = NAV.filter((n): n is [Tab, string, number | null] => n !== null);

  return (
    <main className="app">
      <header className="app-head">
        <span className="wordmark">pylgrim</span>
        <div className="account-side">
          <div className="account-bar">
            {/* Self-hosted runs as one person on their own machine: no
                email to show, no plan to be on, nothing to sign out of. */}
            {FLAGS.HAS_ACCOUNTS && (
              <>
                <span className="account-email">{user.email}</span>
                {free ? (
                  <a className="linkish" href="/plan?upgrade=1">
                    Free plan · Upgrade
                  </a>
                ) : (
                  <span className="account-email">Paid plan</span>
                )}
                <button className="linkish" onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav className="sidenav">
        {nav.map(([id, label, count]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {tab === id && <m.span layoutId="nav-pill" className="nav-pill" />}
            <span className="nav-label">{label}</span>
            {count !== null && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>

      <div className="content">
      {error && <p className="error">{error}</p>}

      {tab === "new" && phase === "intent" && !canGenerate && (
        <UpgradePanel
          title="Stories are made to order"
          what="Say what you're about to do and pylgrim writes the story that rehearses it — that's the paid plan. The shared library in Explore is yours to read either way."
        />
      )}

      {tab === "new" && phase === "intent" && canGenerate && (
        <form className="intent-form" onSubmit={handleExtract}>
          <div className="page-head">
            <Sparkle hue="ochre" wiggle style={{ top: "-0.8rem", right: "6%", width: "2.2rem", height: "2.2rem" }} />
            <Blob hue="lilac" delay="350ms" style={{ left: "-2.5rem", top: "-2.2rem", width: "9rem", height: "9rem", opacity: 0.45 }} />
            <h1>
              What are you about to{" "}
              <span className="squig">
                do?
                <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 9Q15 3 30 8T60 8T90 8T117 7" />
                </svg>
              </span>
            </h1>
          </div>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="I'm going to a café in Madrid this morning and want to order, handle the staff's questions, and ask for the bill"
            rows={4}
            required
            minLength={3}
            suppressHydrationWarning
          />
          <div className="structured-inputs">
            <div className="field">
              Language
              <Select
                ariaLabel="Language"
                value={targetLang}
                onChange={(v) => setTargetLang(v as TargetLang)}
                options={TARGET_LANGS.map((code) => ({
                  value: code,
                  label: `${LANGUAGES[code].name} — ${LANGUAGES[code].regionLabel}`,
                }))}
              />
            </div>
            <div className="field">
              Register
              <Select
                ariaLabel="Register"
                value={register}
                onChange={(v) => setRegister(v as Register)}
                options={(Object.keys(lang.registerLabels) as Register[]).map((r) => ({
                  value: r,
                  label: lang.registerLabels[r],
                }))}
              />
            </div>
            <div className="field">
              Level
              <Select
                ariaLabel="Level"
                minWidth="6.5rem"
                value={level}
                onChange={(v) => setLevel(v as typeof level)}
                options={LEVELS.map((l) => ({ value: l, label: l }))}
              />
            </div>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? "Reading your intent…" : "Continue"}
          </button>
          <p className="hint">
            Or open <button type="button" className="linkish" onClick={() => openStory(sampleStory)}>the sample story</button> — no API key needed.
          </p>
          <p className="hint">
            <button type="button" className="linkish" onClick={() => void practiseWeakPoints()}>
              Practise my weak points
            </button>{" "}
            — builds a story from the objectives you lapse on most.
          </p>
          <p className="hint">
            <button type="button" className="linkish" onClick={() => setPhase("checkpoint")}>
              Checkpoint story
            </button>{" "}
            — pick past stories and get one fresh story that tests them together.
          </p>
        </form>
      )}

      {tab === "new" && phase === "checkpoint" && (
        <Checkpoint
          stories={stories}
          storiesV2={storiesV2}
          onBack={() => setPhase("intent")}
          onGenerate={(objs) => {
            setObjectives(objs);
            // Checkpoints are dialogue-tiers: the richer quiz (reorder,
            // per-line objectives) is the test surface.
            void handleGenerate({ objectives: objs, purpose: "checkpoint", format: "dialogue-tiers" });
          }}
        />
      )}

      {tab === "new" && phase === "objectives" && (
        <section className="objectives-confirm">
          <div className="page-head">
            <Blob hue="sage" variant={2} delay="300ms" style={{ right: "-2rem", top: "-2.5rem", width: "8rem", height: "8rem", opacity: 0.4 }} />
            <Sparkle hue="clay" style={{ top: "-1rem", left: "58%", width: "1.9rem", height: "1.9rem" }} delay="450ms" />
            <h1>This story will teach</h1>
          </div>
          <ul>
            {objectives.map((o, i) => (
              <li key={i}>
                <input
                  value={o}
                  onChange={(e) => setObjectives(objectives.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button onClick={() => setObjectives(objectives.filter((_, j) => j !== i))} aria-label="remove">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setObjectives([...objectives, ""])}>Add objective</button>
          <div className="format-toggle">
            <span className="format-label">Story format</span>
            <label>
              <input
                type="radio"
                name="story-format"
                checked={storyFormat === "dialogue-tiers"}
                onChange={() => setStoryFormat("dialogue-tiers")}
              />
              Dialogue tiers — the conversation deepens across 5 levels (new)
            </label>
            <label>
              <input
                type="radio"
                name="story-format"
                checked={storyFormat === "weave"}
                onChange={() => setStoryFormat("weave")}
              />
              Classic weave — bilingual reading with a difficulty slider
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={privateMode && storyFormat === "weave"}
              disabled={storyFormat !== "weave"}
              onChange={(e) => setPrivateMode(e.target.checked)}
            />
            <span className="box" />
            <span>
              Private story — weave in my own details. Stays yours alone; shared stories are built
              from the learning goals only. {storyFormat !== "weave" && "(classic weave only, for now)"}
            </span>
          </label>
          <div className="row">
            <button onClick={() => setPhase("intent")}>Back</button>
            <button className="primary" onClick={() => void handleGenerate()} disabled={busy || objectives.every((o) => o.trim().length < 3)}>
              Generate the story
            </button>
          </div>
        </section>
      )}

      {tab === "new" && phase === "generating" && (
        <section className="generating">
          <div className="page-head">
            <Sparkle hue="clay" wiggle style={{ top: "-0.8rem", right: "10%", width: "2.2rem", height: "2.2rem" }} />
            <Blob hue="dusty" variant={2} delay="400ms" style={{ right: "8%", top: "0.5rem", width: "6.5rem", height: "6.5rem", opacity: 0.35 }} />
            <h1>Writing your story</h1>
          </div>
          {progress.length === 0 && (
            <>
              <p className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </p>
              <p className="hint">
                {storyFormat === "dialogue-tiers"
                  ? "Writing the story and all five conversation tiers — this one arrives whole, give it a couple of minutes."
                  : "First sentences arrive in a few seconds."}
              </p>
            </>
          )}
          {progress.map((s, i) => (
            <m.p
              key={i}
              className="progress-seg"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.max(0, i - prevProgressLen.current) * STREAM_STAGGER }}
            >
              <span lang={targetLang}>{s.target_text}</span>
              <span className="progress-l1">{s.l1_text}</span>
            </m.p>
          ))}
        </section>
      )}

      {tab === "new" && phase === "reading" && quizRequest && (
        <Quiz
          source={quizRequest.source}
          difficulty={quizRequest.difficulty}
          onClose={() => {
            setQuizRequest(null);
            void refreshCards();
          }}
        />
      )}

      {tab === "new" && phase === "reading" && !quizRequest && storyV2 && practiceTier !== null && (
        <Practice
          story={storyV2}
          tier={practiceTier}
          onClose={() => setPracticeTier(null)}
          onTierUp={(next) => setPracticeTier(next)}
        />
      )}

      {tab === "new" && phase === "reading" && !quizRequest && storyV2 && practiceTier === null && (
        <>
          <StoryReaderV2
            key={`${storyV2.id}-${openAt ?? "d"}`}
            story={storyV2}
            initialTier={openAt}
            onSavedCard={refreshCards}
            onPractise={(tier) => setPracticeTier(tier)}
            onQuiz={(tier) =>
              setQuizRequest({ source: { format: "dialogue-tiers", story: storyV2, tier }, difficulty: tier })
            }
            onOpenPool={FLAGS.HAS_POOL ? openPoolSuggestion : undefined}
          />
          <div className="row compare-row">
            <button
              className="again"
              onClick={() => void handleGenerate({ objectives: storyV2.objectives, format: "weave" })}
              disabled={busy}
            >
              Compare: same story as classic weave
            </button>
            <button className="again" onClick={() => { setPhase("intent"); setStoryV2(null); }}>
              New story
            </button>
          </div>
        </>
      )}

      {tab === "new" && phase === "reading" && !quizRequest && story && (
        <>
          <StoryReader
            key={`${story.core.id}-${openAt ?? "d"}`}
            story={story}
            initialDifficulty={openAt}
            onSavedCard={refreshCards}
            onRegenerate={handleRegenerate}
            onQuiz={(difficulty) => setQuizRequest({ source: { format: "weave", story }, difficulty })}
            onOpenPool={FLAGS.HAS_POOL ? openPoolSuggestion : undefined}
          />
          <button
            className="again"
            onClick={() => void handleGenerate({ objectives: story.core.objectives, format: "dialogue-tiers" })}
            disabled={busy}
          >
            Compare: same story as dialogue tiers
          </button>
          {FLAGS.HAS_POOL && !story.poolId && (
            <ShareFlow
              story={story}
              onDone={async (contributed) => {
                if (contributed && story) {
                  const updated = { ...story, poolId: "contributed" };
                  await saveStory(updated);
                  setStory(updated);
                }
              }}
            />
          )}
          <button className="again" onClick={() => { setPhase("intent"); setStory(null); }}>
            New story
          </button>
        </>
      )}

      {FLAGS.HAS_POOL && tab === "explore" && (
        <Explore
          onOpen={(s) => {
            openStory(s);
          }}
          onOpenV2={(s) => {
            openStoryV2(s);
          }}
        />
      )}

      {tab === "translate" &&
        (!canGenerate ? (
          <UpgradePanel
            title="Quick translate"
            what="Short text in, an aligned mini-story out — flip it, save cards from it. It runs a model per translation, so it comes with the paid plan."
          />
        ) : (
          <Translate onSavedCard={refreshCards} />
        ))}

      {tab === "review" && <Review />}

      {tab === "progress" && (
        <Progress
          onOpenStory={(s, difficulty) => openStory(s, difficulty)}
          onOpenStoryV2={(s, tier) => openStoryV2(s, tier)}
          onPractiseWeak={() => void practiseWeakPoints()}
        />
      )}

      {tab === "library" && (
        <section className="library">
          <div className="page-head">
            <Blob hue="ochre" variant={2} delay="300ms" style={{ left: "-2.5rem", top: "-2rem", width: "7.5rem", height: "7.5rem", opacity: 0.4 }} />
            <Sparkle hue="dusty" style={{ top: "-0.7rem", left: "11rem", width: "1.8rem", height: "1.8rem" }} delay="450ms" />
            <h1>Library</h1>
          </div>
          {stories.length === 0 && storiesV2.length === 0 && <p className="hint">Nothing saved yet.</p>}
          <ul>
            {storiesV2.map((s) => (
              <li key={s.id}>
                <button className="linkish" onClick={() => openStoryV2(s)}>
                  <span lang={s.targetLang}>{s.titleTarget}</span>
                </button>
                <span className="meta">
                  💬 dialogue tiers · {s.level} · {s.region} · {s.objectives.length} objectives
                </span>
              </li>
            ))}
            {stories.map((s) => (
              <li key={s.core.id}>
                <button className="linkish" onClick={() => openStory(s)}>
                  <span lang={s.core.targetLang}>{s.core.title}</span>
                </button>
                <span className="meta">
                  {s.core.level} · {s.core.region} · {s.core.objectives.length} objectives
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "cards" && (
        <section className="cards">
          <div className="page-head">
            <Blob hue="clay" delay="350ms" style={{ right: "-1.5rem", top: "-2rem", width: "7rem", height: "7rem", opacity: 0.4 }} />
            <Sparkle hue="sage" style={{ top: "-0.7rem", left: "9.5rem", width: "1.7rem", height: "1.7rem" }} delay="500ms" />
            <h1>Cards</h1>
          </div>
          {free && (
            <p className="hint">
              {cards.length} of {FREE_CARD_CAP} cards on the free plan
              {cards.length >= FREE_CARD_CAP && (
                <>
                  {" "}
                  — <a className="linkish" href="/plan?upgrade=1">upgrade for unlimited</a>. Nothing you&apos;ve saved is lost.
                </>
              )}
            </p>
          )}
          {cards.length > 0 && (
            <div className="export-row">
              <button onClick={() => download("pylgrim-cards.csv", cardsToCsv(cards), "text/csv")}>
                Export cards (CSV)
              </button>
              <button onClick={() => download("pylgrim-anki.txt", cardsToAnki(cards), "text/plain")}>
                Export for Anki
              </button>
              <button onClick={() => download("pylgrim-stories.csv", storiesToCsv(stories), "text/csv")}>
                Export stories (CSV)
              </button>
            </div>
          )}
          {cards.length === 0 && <p className="hint">Select a phrase in a story and save it.</p>}
          <ul>
            {cards.map((c) => (
              <li key={c.id} className="card">
                <span lang={c.targetLang} className="card-target">
                  {c.targetText}{" "}
                  <AudioButton title="hear it" onPlay={() => playClip(c.targetText, c.targetLang)} />
                </span>
                <span className="card-l1">{c.l1Text}</span>
                <button
                  aria-label="delete"
                  onClick={async () => {
                    await deleteCardMutation(c);
                    scheduleSync();
                    refreshCards();
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </main>
  );
}
