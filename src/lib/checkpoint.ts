/**
 * Checkpoint stories (work item checkpoint-stories): the user picks a set
 * of their stories (or leans on their weak objectives) and the UNION of
 * those objectives becomes a normal objectives-only generation — no typed
 * intent, no new generation mode. Cumulative retrieval over recombined
 * material is the best-evidenced testing shape in the literature; the
 * "test" itself is the derived quiz over the fresh story, whose
 * per-objective results land in mastery like every other review.
 */

export const CHECKPOINT_MAX_OBJECTIVES = 8; // the shared request schema's cap

/** Union of objectives, weak points first, deduped case-insensitively,
 *  capped at the request schema's limit. Pure. */
export function checkpointObjectives(sources: { objectives: string[] }[], weak: string[] = [], max = CHECKPOINT_MAX_OBJECTIVES): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (o: string) => {
    const trimmed = o.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length < 3 || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  for (const w of weak) add(w);
  for (const s of sources) for (const o of s.objectives) add(o);
  return out.slice(0, max);
}
