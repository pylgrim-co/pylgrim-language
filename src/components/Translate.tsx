"use client";

import { useState } from "react";
import type { Story } from "../lib/schema";
import { generatedStorySchema } from "../lib/schema";
import { toStoredStory } from "../lib/offsets";
import { LANGUAGES, TARGET_LANGS, type Register, type TargetLang } from "../lib/languages";
import StoryReader from "./StoryReader";
import Select from "./ui/Select";
import { Sparkle, Blob } from "./ui/Doodle";

/**
 * Quick translate — the low-ceremony surface. Same aligned structure at
 * miniature scale, so the result IS a (unsaved) story: flip and save
 * behave identically, and a saved card enters review like any other.
 */

export default function Translate({ onSavedCard }: { onSavedCard?: () => void }) {
  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState<TargetLang>("es");
  const [register, setRegister] = useState<Register>("formal");
  const [level, setLevel] = useState<"A1" | "A2" | "B1" | "B2" | "C1">("A2");
  const lang = LANGUAGES[targetLang];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Story | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang, region: lang.region, register, level }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `translation failed (${res.status})`);
      }
      const gen = generatedStorySchema.parse(await res.json());
      setResult(
        toStoredStory(gen, {
          id: crypto.randomUUID(),
          targetLang,
          region: lang.region,
          register,
          level,
          objectives: ["quick translation"],
          l1: "en",
          createdAt: new Date().toISOString(),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "translation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="translate">
      <div className="page-head">
        <Blob hue="ochre" delay="350ms" style={{ right: "-1.5rem", top: "-2.5rem", width: "7rem", height: "7rem", opacity: 0.38 }} />
        <Sparkle hue="lilac" wiggle style={{ top: "-0.9rem", left: "13rem", width: "2rem", height: "2rem" }} />
        <h1>How do I say…</h1>
      </div>
      <form onSubmit={handleSubmit} className="translate-form">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Could I get the bill, please? We're in a bit of a hurry."
          rows={3}
          maxLength={500}
          required
        />
        <div className="structured-inputs">
          <div className="field">
            Language
            <Select
              ariaLabel="Language"
              value={targetLang}
              onChange={(v) => setTargetLang(v as TargetLang)}
              options={TARGET_LANGS.map((code) => ({ value: code, label: LANGUAGES[code].name }))}
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
              options={["A1", "A2", "B1", "B2", "C1"].map((l) => ({ value: l, label: l }))}
            />
          </div>
        </div>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Translating…" : "Translate"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && <StoryReader story={result} mini onSavedCard={onSavedCard} />}
    </section>
  );
}
