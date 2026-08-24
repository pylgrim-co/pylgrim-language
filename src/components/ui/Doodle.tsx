import type { CSSProperties } from "react";

/**
 * Bubble Ink decoration kit (design.md §5): pop-hue SVG shapes positioned
 * absolutely inside a .page-head. Decoration only — never inside story
 * surfaces, and pop hues never carry text. Animation comes from the
 * .sticker / .wiggle classes in base.css (reduced-motion aware).
 */

type Hue = "clay" | "sage" | "dusty" | "ochre" | "lilac";

interface DoodleProps {
  hue?: Hue;
  style?: CSSProperties;
  /** entrance delay for the sticker-pop animation */
  delay?: string;
}

function stickerStyle(style: CSSProperties | undefined, delay: string | undefined): CSSProperties {
  return (delay ? { ...style, "--d": delay } : (style ?? {})) as CSSProperties;
}

export function Sparkle({ hue = "ochre", wiggle = false, style, delay }: DoodleProps & { wiggle?: boolean }) {
  return (
    <svg
      className={wiggle ? "sticker wiggle" : "sticker"}
      style={stickerStyle(style, delay)}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill={`var(--pop-${hue})`} d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
    </svg>
  );
}

const BLOBS: Record<1 | 2, string> = {
  1: "M62,-64C77,-49,84,-25,82,-3C80,19,69,39,53,54C37,69,15,79,-6,77C-27,75,-54,61,-67,41C-80,21,-79,-5,-69,-26C-59,-47,-40,-63,-19,-70C2,-77,47,-79,62,-64Z",
  2: "M45,-52C60,-42,74,-28,78,-11C82,6,76,25,64,39C52,53,34,62,15,66C-4,70,-24,69,-40,60C-56,51,-68,34,-71,15C-74,-4,-68,-25,-55,-40C-42,-55,-21,-64,-2,-62C17,-60,30,-62,45,-52Z",
};

export function Blob({ hue = "lilac", variant = 1, style, delay }: DoodleProps & { variant?: 1 | 2 }) {
  return (
    <svg className="sticker" style={stickerStyle(style, delay)} viewBox="0 0 200 200" aria-hidden="true">
      <path fill={`var(--pop-${hue})`} d={BLOBS[variant]} transform="translate(100 100)" />
    </svg>
  );
}
