"use client";

import { useEffect, useState } from "react";
import { PAPER_BG_HEX, INK_BG_HEX } from "../design/colors";

type ThemeChoice = "system" | "paper" | "ink";

const LABELS: Record<ThemeChoice, string> = {
  system: "Auto",
  paper: "Light",
  ink: "Dark",
};

const TITLES: Record<ThemeChoice, string> = {
  system: "Theme: following your system — click for light",
  paper: "Theme: light — click for dark",
  ink: "Theme: dark — click to follow your system",
};

const ICONS: Record<ThemeChoice, React.ReactNode> = {
  system: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="2" />
      <path fill="currentColor" d="M10 4.5a5.5 5.5 0 0 1 0 11z" />
    </svg>
  ),
  paper: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="10" y1="1.5" x2="10" y2="3.6" />
        <line x1="10" y1="16.4" x2="10" y2="18.5" />
        <line x1="1.5" y1="10" x2="3.6" y2="10" />
        <line x1="16.4" y1="10" x2="18.5" y2="10" />
        <line x1="4" y1="4" x2="5.5" y2="5.5" />
        <line x1="14.5" y1="14.5" x2="16" y2="16" />
        <line x1="16" y1="4" x2="14.5" y2="5.5" />
        <line x1="4" y1="16" x2="5.5" y2="14.5" />
      </g>
    </svg>
  ),
  ink: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.3 11.6A7.5 7.5 0 0 1 8.4 2.7a.55.55 0 0 0-.75-.63 8.5 8.5 0 1 0 10.28 10.28.55.55 0 0 0-.63-.75z"
      />
    </svg>
  ),
};

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.theme;
    localStorage.removeItem("pylgrim-theme");
  } else {
    root.dataset.theme = choice;
    localStorage.setItem("pylgrim-theme", choice);
  }
  const dark = choice === "ink" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? INK_BG_HEX : PAPER_BG_HEX);
}

export default function ThemeToggle() {
  // Render the neutral state on the server; resolve the stored choice after
  // mount so hydration never mismatches.
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = localStorage.getItem("pylgrim-theme");
    if (stored === "paper" || stored === "ink") setChoice(stored);
  }, []);

  function cycle() {
    const next: ThemeChoice = choice === "system" ? "paper" : choice === "paper" ? "ink" : "system";
    setChoice(next);
    apply(next);
  }

  return (
    <button type="button" className="theme-toggle" onClick={cycle} title={TITLES[choice]} aria-label={TITLES[choice]}>
      {ICONS[choice]}
      <span className="sr-only">{LABELS[choice]} theme</span>
    </button>
  );
}
