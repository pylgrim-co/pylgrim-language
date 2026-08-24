import type { Card, Story } from "./schema";

/**
 * Export — non-negotiable given the open-source positioning (PLAN.md §11).
 * CSV for cards and stories; a tab-separated file with Anki file-headers
 * for direct import (Anki ≥2.1.55 reads #separator/#html directives, so
 * the import needs no manual field mapping).
 */

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function cardsToCsv(cards: Card[]): string {
  const header = "target,l1,language,region,story_id,created_at";
  const rows = cards.map((c) =>
    [c.targetText, c.l1Text, c.targetLang, c.region, c.storyId, c.createdAt].map(csvEscape).join(","),
  );
  return [header, ...rows].join("\r\n") + "\r\n";
}

export function storiesToCsv(stories: Story[]): string {
  const header = "title_target,title_l1,language,region,level,register,objectives,target_text,l1_text,created_at";
  const rows = stories.map((s) =>
    [
      s.core.title,
      s.rendering.title,
      s.core.targetLang,
      s.core.region,
      s.core.level,
      s.core.register,
      s.core.objectives.join("; "),
      s.core.segments.map((seg) => seg.targetText).join(" "),
      s.rendering.segments.map((seg) => seg.l1Text).join(" "),
      s.createdAt,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\r\n") + "\r\n";
}

/** Anki import file: front = target language, back = L1. Tabs never occur
 *  in card text (they cannot survive the span pipeline), but strip any
 *  defensively so a row can never gain a phantom third field. */
export function cardsToAnki(cards: Card[]): string {
  const headers = "#separator:tab\n#html:false\n";
  const rows = cards.map((c) => `${c.targetText.replace(/\t/g, " ")}\t${c.l1Text.replace(/\t/g, " ")}`);
  return headers + rows.join("\n") + "\n";
}

/** Browser download helper. */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
