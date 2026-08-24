/**
 * Deterministic privacy scrub at the extraction boundary.
 *
 * The extraction prompt tells the model to strip personal specifics, and
 * it usually does — but "usually" is not "by construction" (charter:
 * pooled content carries no personal detail by construction, not by
 * filtering... and not by prompting either). This layer makes the
 * guarantee mechanical: any objective statement containing a token that
 * looks personal IN THE INTENT is dropped before it can reach the shared
 * path.
 *
 * Personal-looking tokens: words capitalised mid-sentence (names, places,
 * brands), and tokens containing digits (addresses, dates, times). Crude
 * on purpose — false positives cost one dropped objective; false
 * negatives cost a privacy incident.
 */

const STOPLIST = new Set([
  "i", "i'm", "i'll", "i've", "i'd",
  "mr", "mrs", "ms", "dr", "st",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  // weekdays stay OUT of objectives anyway via the digit/name rules on
  // real dates; bare weekday names are generic enough to allow
]);

/** Words capitalised where English grammar doesn't require it, plus digit tokens. */
export function extractPersonalTokens(intent: string): Set<string> {
  const tokens = new Set<string>();
  // Split into sentences so sentence-initial capitals don't count.
  // Title abbreviations (Dr. / Mr. / St. ...) do NOT end a sentence —
  // otherwise "Dr. Okonkwo" makes the name sentence-initial and exempt.
  const sentences = intent.split(/(?<!\b(?:Dr|Mr|Mrs|Ms|St|Prof|Ave|Rd))[.!?]\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    words.forEach((raw, i) => {
      const word = raw.replace(/[^\p{L}\p{N}''-]/gu, "");
      if (!word) return;
      const lower = word.toLowerCase();
      if (/\d/.test(word)) {
        tokens.add(lower);
        return;
      }
      if (i === 0) return; // sentence-initial capitals are grammar, not names
      if (/^\p{Lu}/u.test(word) && !STOPLIST.has(lower)) {
        tokens.add(lower);
      }
    });
  }
  return tokens;
}

export interface ScrubResult {
  objectives: string[];
  dropped: string[];
}

/** Drop any statement containing a personal-looking token from the intent. */
export function scrubObjectives(statements: string[], intent: string): ScrubResult {
  const personal = extractPersonalTokens(intent);
  if (personal.size === 0) return { objectives: statements, dropped: [] };

  const objectives: string[] = [];
  const dropped: string[] = [];
  for (const statement of statements) {
    const words = new Set(
      statement
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^\p{L}\p{N}''-]/gu, "")),
    );
    const leaks = [...personal].some((t) => words.has(t));
    (leaks ? dropped : objectives).push(statement);
  }
  return { objectives, dropped };
}
