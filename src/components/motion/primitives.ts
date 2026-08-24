/**
 * Shared motion vocabulary — JS mirrors of the CSS motion tokens in
 * app/styles/tokens.css. Three primitives, used everywhere; nothing else.
 */

/** --ease-out */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** --dur-fast / --dur-base in seconds (motion uses seconds) */
export const DUR_FAST = 0.12;
export const DUR_BASE = 0.2;

/** Streamed content arrival: quiet rise. */
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
} as const;

/** Ink-slab surfaces (selection toolbar, toast): crisp spring in, quick fade out. */
export const slabSpring = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: DUR_FAST } },
  transition: { type: "spring", stiffness: 500, damping: 34 },
} as const;

/** Per-batch stagger step for streamed story segments. */
export const STREAM_STAGGER = 0.06;
