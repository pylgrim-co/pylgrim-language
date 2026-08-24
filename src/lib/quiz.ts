import type { Story } from "./schema";
import type { StoryV2 } from "./schema-v2";
import { sliceSpan } from "./offsets";
import { selectTier } from "./dialogue";
import { db } from "./db";
import { gradeCard } from "./review";
import { recordReview, saveCard } from "./mutations";

/**
 * Per-story quizzes (work item derived-per-story-quizzes).
 *
 * The quiz DERIVES deterministically from the stored story — the aligned
 * span pairs ARE the item bank. No AI call, no server route, no network:
 * a quiz is a client-side render over data the story already carries,
 * philosophically identical to the difficulty slider. The same story and
 * seed always produce the identical quiz.
 *
 * Item types over the shared span-pair substrate (both formats):
 *   cloze       — the target sentence with a span blanked; pick the span.
 *                 Distractors are frequency-rank-matched pairs.
 *   meaning     — a target phrase; pick its English meaning.
 *   which-line  — an English prompt; pick the target sentence/line that
 *                 says it (comprehension).
 * v2 only:
 *   reorder     — an exchange with its lines shuffled; restore the order.
 *
 * Answers feed the SAME retention loop as review and practice: a correct
 * answer grades Good, a miss grades Again, on a card keyed like practice
 * cards — (storyId, targetText) — so quizzing strengthens rather than
 * duplicates. Corrective feedback (the right answer shown on a miss) is
 * the component's job; the testing effect roughly doubles with it.
 */

// ---------- deterministic randomness ----------

function hashSeed(s: string): number {
  // FNV-1a: stable across sessions and platforms.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- candidates ----------

interface PairCandidate {
  l1: string;
  target: string;
  granularity: "word" | "phrase";
  frequencyRank: number;
  payload: boolean;
  /** the sentence/line the pair lives in, both sides */
  sentenceTarget: string;
  sentenceL1: string;
  segmentId: string;
  objective: string | null;
}

interface LineCandidate {
  l1: string;
  target: string;
  payload: boolean;
  segmentId: string;
  objective: string | null;
}

interface CandidateSet {
  pairs: PairCandidate[];
  lines: LineCandidate[];
  exchanges: LineCandidate[][]; // v2 only: whole exchanges for reorder
}

function candidatesFromStory(story: Story): CandidateSet {
  const pairs: PairCandidate[] = [];
  const lines: LineCandidate[] = [];
  story.core.segments.forEach((seg, i) => {
    const rseg = story.rendering.segments[i];
    if (!rseg) return;
    lines.push({
      l1: rseg.l1Text,
      target: seg.targetText,
      payload: seg.payload,
      segmentId: seg.id,
      objective: null, // v1 carries no per-span objective identity
    });
    for (const pair of rseg.pairs) {
      pairs.push({
        l1: sliceSpan(rseg.l1Text, pair.l1),
        target: sliceSpan(seg.targetText, pair.target),
        granularity: pair.granularity,
        frequencyRank: pair.frequencyRank,
        payload: pair.payload,
        sentenceTarget: seg.targetText,
        sentenceL1: rseg.l1Text,
        segmentId: seg.id,
        objective: null,
      });
    }
  });
  return { pairs, lines, exchanges: [] };
}

function candidatesFromStoryV2(story: StoryV2, tier: number): CandidateSet {
  const pairs: PairCandidate[] = [];
  const lines: LineCandidate[] = [];
  const exchanges: LineCandidate[][] = [];
  for (const block of selectTier(story, tier)) {
    if (block.kind !== "exchange") continue;
    const exchange: LineCandidate[] = [];
    for (const line of block.lines) {
      const objective =
        line.objectiveIndex !== null && story.objectives[line.objectiveIndex] !== undefined
          ? story.objectives[line.objectiveIndex]
          : null;
      const candidate: LineCandidate = {
        l1: line.l1Text,
        target: line.targetText,
        payload: line.payload,
        segmentId: line.id,
        objective,
      };
      lines.push(candidate);
      exchange.push(candidate);
      for (const pair of line.pairs) {
        pairs.push({
          l1: sliceSpan(line.l1Text, pair.l1),
          target: sliceSpan(line.targetText, pair.target),
          granularity: pair.granularity,
          frequencyRank: pair.frequencyRank,
          payload: pair.payload,
          sentenceTarget: line.targetText,
          sentenceL1: line.l1Text,
          segmentId: line.id,
          objective,
        });
      }
    }
    if (exchange.length >= 3) exchanges.push(exchange);
  }
  return { pairs, lines, exchanges };
}

// ---------- quiz shape ----------

export interface QuizOption {
  id: string;
  text: string;
}

export interface ChoiceItem {
  kind: "cloze" | "meaning" | "which-line";
  id: string;
  /** what the learner reads: L1 text or a sentence with a blank */
  prompt: string;
  promptLang: string;
  options: QuizOption[];
  optionsLang: string;
  correctId: string;
  /** both sides of the phrase under test — the card seed */
  l1Text: string;
  targetText: string;
  segmentId: string;
  objective: string | null;
}

export interface ReorderItem {
  kind: "reorder";
  id: string;
  prompt: string;
  /** shuffled lines to restore; text is the target language */
  lines: QuizOption[];
  correctOrder: string[];
  optionsLang: string;
}

export type QuizItem = ChoiceItem | ReorderItem;

export interface Quiz {
  storyId: string;
  format: "weave" | "dialogue-tiers";
  targetLang: string;
  region: string;
  l1: string;
  seed: number;
  /** the weave difficulty / dialogue tier the quiz was taken against */
  difficulty: number;
  items: QuizItem[];
}

export interface QuizOptions {
  seed?: number;
  /** v2: which tier's dialogue to quiz (defaults to 2, the reader default) */
  tier?: number;
  maxItems?: number;
}

const norm = (s: string) => s.trim().toLowerCase();

// ---------- derivation ----------

function buildCloze(c: PairCandidate, pool: PairCandidate[], rng: () => number, id: string): ChoiceItem | null {
  const seen = new Set<string>([norm(c.target)]);
  const eligible = pool
    .filter((p) => !seen.has(norm(p.target)) && norm(p.l1) !== norm(c.l1))
    .sort(
      (a, b) =>
        (a.granularity === c.granularity ? 0 : 1) - (b.granularity === c.granularity ? 0 : 1) ||
        Math.abs(a.frequencyRank - c.frequencyRank) - Math.abs(b.frequencyRank - c.frequencyRank),
    );
  const distractors: PairCandidate[] = [];
  for (const p of eligible) {
    if (seen.has(norm(p.target))) continue;
    seen.add(norm(p.target));
    distractors.push(p);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 2) return null;

  const blanked = c.sentenceTarget.replace(c.target, "____");
  if (blanked === c.sentenceTarget) return null; // span text not found verbatim — skip, never repair
  const options = shuffled(
    [c, ...distractors].map((p, i) => ({ id: `${id}-o${i}`, text: p.target })),
    rng,
  );
  const correct = options.find((o) => norm(o.text) === norm(c.target))!;
  return {
    kind: "cloze",
    id,
    prompt: blanked,
    promptLang: "", // filled by caller with targetLang
    options,
    optionsLang: "",
    correctId: correct.id,
    l1Text: c.l1,
    targetText: c.target,
    segmentId: c.segmentId,
    objective: c.objective,
  };
}

function buildMeaning(c: PairCandidate, pool: PairCandidate[], rng: () => number, id: string): ChoiceItem | null {
  const seen = new Set<string>([norm(c.l1)]);
  const distractors: PairCandidate[] = [];
  const eligible = pool
    .filter((p) => norm(p.target) !== norm(c.target))
    .sort((a, b) => Math.abs(a.frequencyRank - c.frequencyRank) - Math.abs(b.frequencyRank - c.frequencyRank));
  for (const p of eligible) {
    if (seen.has(norm(p.l1))) continue;
    seen.add(norm(p.l1));
    distractors.push(p);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 2) return null;
  const options = shuffled(
    [c, ...distractors].map((p, i) => ({ id: `${id}-o${i}`, text: p.l1 })),
    rng,
  );
  const correct = options.find((o) => norm(o.text) === norm(c.l1))!;
  return {
    kind: "meaning",
    id,
    prompt: c.target,
    promptLang: "",
    options,
    optionsLang: "",
    correctId: correct.id,
    l1Text: c.l1,
    targetText: c.target,
    segmentId: c.segmentId,
    objective: c.objective,
  };
}

function buildWhichLine(c: LineCandidate, pool: LineCandidate[], rng: () => number, id: string): ChoiceItem | null {
  const seen = new Set<string>([norm(c.target)]);
  const distractors: LineCandidate[] = [];
  for (const p of shuffled(pool, rng)) {
    if (seen.has(norm(p.target)) || norm(p.l1) === norm(c.l1)) continue;
    seen.add(norm(p.target));
    distractors.push(p);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 2) return null;
  const options = shuffled(
    [c, ...distractors].map((p, i) => ({ id: `${id}-o${i}`, text: p.target })),
    rng,
  );
  const correct = options.find((o) => norm(o.text) === norm(c.target))!;
  return {
    kind: "which-line",
    id,
    prompt: c.l1,
    promptLang: "",
    options,
    optionsLang: "",
    correctId: correct.id,
    l1Text: c.l1,
    targetText: c.target,
    segmentId: c.segmentId,
    objective: c.objective,
  };
}

export type QuizSource = { format: "weave"; story: Story } | { format: "dialogue-tiers"; story: StoryV2; tier?: number };

export function deriveQuiz(source: QuizSource, opts: QuizOptions = {}): Quiz {
  const seed = opts.seed ?? 1;
  const maxItems = opts.maxItems ?? 8;
  const tier = source.format === "dialogue-tiers" ? (source.tier ?? opts.tier ?? 2) : 0;

  const storyId = source.format === "weave" ? source.story.core.id : source.story.id;
  const targetLang = source.format === "weave" ? source.story.core.targetLang : source.story.targetLang;
  const region = source.format === "weave" ? source.story.core.region : source.story.region;
  const l1 = source.format === "weave" ? source.story.rendering.l1 : "en";

  const rng = mulberry32(hashSeed(`${storyId}:${seed}:${tier}`));
  const set = source.format === "weave" ? candidatesFromStory(source.story) : candidatesFromStoryV2(source.story, tier);

  // Payload (objective-bearing) material first, then common before rare —
  // the same priority order the weave itself uses.
  const rankedPairs = [...set.pairs].sort(
    (a, b) => (a.payload === b.payload ? a.frequencyRank - b.frequencyRank : a.payload ? -1 : 1),
  );
  const rankedLines = [...set.lines].sort((a, b) => (a.payload === b.payload ? 0 : a.payload ? -1 : 1));

  const items: QuizItem[] = [];
  const usedTargets = new Set<string>();
  let n = 0;

  // Up to 3 cloze items.
  for (const c of rankedPairs) {
    if (items.filter((i) => i.kind === "cloze").length >= 3) break;
    if (usedTargets.has(norm(c.target))) continue;
    const item = buildCloze(c, set.pairs, rng, `${storyId}-q${n}`);
    if (item) {
      usedTargets.add(norm(c.target));
      items.push({ ...item, promptLang: targetLang, optionsLang: targetLang });
      n++;
    }
  }

  // Up to 2 meaning items on pairs not already quizzed.
  for (const c of rankedPairs) {
    if (items.filter((i) => i.kind === "meaning").length >= 2) break;
    if (usedTargets.has(norm(c.target))) continue;
    const item = buildMeaning(c, set.pairs, rng, `${storyId}-q${n}`);
    if (item) {
      usedTargets.add(norm(c.target));
      items.push({ ...item, promptLang: targetLang, optionsLang: l1 });
      n++;
    }
  }

  // Up to 2 comprehension items over whole sentences/lines.
  for (const c of rankedLines) {
    if (items.filter((i) => i.kind === "which-line").length >= 2) break;
    if (usedTargets.has(norm(c.target))) continue;
    const item = buildWhichLine(c, set.lines, rng, `${storyId}-q${n}`);
    if (item) {
      usedTargets.add(norm(c.target));
      items.push({ ...item, promptLang: l1, optionsLang: targetLang });
      n++;
    }
  }

  // One reorder item — v2 dialogue only (weave sentences have no turn order
  // worth restoring; the shared substrate ends at span pairs).
  if (source.format === "dialogue-tiers" && set.exchanges.length > 0) {
    const exchange = set.exchanges[Math.floor(rng() * set.exchanges.length)];
    const lines = exchange.map((line, i) => ({ id: `${storyId}-r${i}`, text: line.target }));
    const shuffledLines = shuffled(lines, rng);
    // A shuffle that lands in the original order is not a puzzle.
    if (shuffledLines.some((o, i) => o.id !== lines[i].id)) {
      items.push({
        kind: "reorder",
        id: `${storyId}-q${n}`,
        prompt: "Put the conversation back in order",
        lines: shuffledLines,
        correctOrder: lines.map((o) => o.id),
        optionsLang: targetLang,
      });
      n++;
    }
  }

  return {
    storyId,
    format: source.format,
    targetLang,
    region,
    l1,
    seed,
    difficulty: source.format === "dialogue-tiers" ? tier : 0,
    items: items.slice(0, maxItems),
  };
}

// ---------- the review-loop bridge ----------

export type QuizGradeChoice = "got" | "missed";

/** One card per quizzed phrase, keyed like practice cards: (storyId,
 *  targetText), reused across sessions so quizzing strengthens. */
export async function findOrCreateQuizCard(quiz: Quiz, item: ChoiceItem) {
  const cards = await db.listCards();
  const existing = cards.find((c) => c.storyId === quiz.storyId && c.targetText === item.targetText);
  if (existing) return existing;
  return saveCard({
    id: crypto.randomUUID(),
    l1Text: item.l1Text,
    targetText: item.targetText,
    targetLang: quiz.targetLang,
    region: quiz.region,
    storyId: quiz.storyId,
    segmentId: item.segmentId,
    createdAt: new Date().toISOString(),
  });
}

/** Record one answered choice item: correct grades Good, a miss grades
 *  Again, through the SAME gradeCard → recordReview path as review and
 *  practice. Reorder items score the run but carry no single phrase, so
 *  they stay out of the card loop. */
export async function recordQuizAnswer(quiz: Quiz, item: ChoiceItem, correct: boolean, clientId: string): Promise<void> {
  const card = await findOrCreateQuizCard(quiz, item);
  const { updatedCard, event } = gradeCard(card, correct ? 3 : 1, clientId);
  await recordReview(event, updatedCard);
}
