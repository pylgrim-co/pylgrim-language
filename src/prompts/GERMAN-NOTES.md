# German weave readability — findings

Work item `p1-languages-french-german`, criterion 5. Reviewed against the
hand-authored sample (`sample-story-de.ts`) and a live Fable 5 generation
("Der Gleiswechsel", 33 segments, 47/47 alignment pairs surviving offset
validation, 4 payload segments) on 2026-08-19. Reviewer: Claude (agent);
native-speaker sign-off is a separate, still-open criterion.

## What was reviewed

German is the weave stress test (PLAN.md §8.2): compound nouns complicate
span alignment, and V2 / verb-final word order threatens clause-level flip
readability. Both risks were exercised deliberately.

## Findings

**1. Single-clause segmentation holds, and it is the load-bearing rule.**
The prompt (generate.ts v3) instructs one clause per segment for German;
the live story produced 0 segments over 18 scaffold words out of 33. This
matters because V2 problems only materialise when a flip crosses a clause
boundary — a whole single-clause segment flip is always well-ordered
German, and a word/phrase flip inside an English scaffold is an island
that carries no German word order at all. **The weave's granularity set
(word/phrase pairs + whole-segment flips, nothing between) is exactly the
right shape for German** — the risk PLAN.md flagged is structural only if
sub-clause multi-word flips spanning verb positions are ever added. They
should not be.

**2. Compound nouns work through asymmetric spans, in both directions.**
"the ticket counter." ↔ "den Fahrkartenschalter." (3 words ↔ 2) and
"right away." ↔ "sofort" render and flip cleanly; the word-index format
never assumed symmetric widths. The live generation produced these
unprompted ("train station" ↔ "Bahnhof", "announcements." ↔ "Durchsagen.").

**3. Pairs must carry their article, because the article carries case.**
"hinter dem Glas" is only correct with `dem` inside the span — a bare
"Glas" flip would teach nothing about the dative. The live output included
articles consistently. If future generations drop them, add an explicit
"include the article in noun-phrase pairs" line to the German alignment
notes; not needed yet.

**4. Separable verbs are handled by avoidance, correctly.** The prompt
forbids pairing a prefix or stem alone; the live story kept "fährt … ab"
inside payload segments (whole-segment flips), which is the right outcome.
Watch for violations in future measure runs; none seen yet.

**5. Position-divergent phrases read acceptably.** "this weekend" (mid-
sentence in English) ↔ "am Wochenende" (post-verb in German): the woven
English sentence hosts the German island at the ENGLISH position, which is
readable and pedagogically fine at phrase granularity — the learner is
acquiring the chunk, not its syntax. Whole-segment flips teach the order.

## Policy adjustments made

The adjustment lives in the prompt, not the renderer: generate.ts v3's
German block (single-clause segments, compound-noun pairing rule,
separable-verb rule). The renderer needed no change — finding 1 explains
why. Re-review after the first native-speaker pass and after any change
to the weave's granularity set.
