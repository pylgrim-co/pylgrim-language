import { Baloo_2, Nunito_Sans, Literata } from "next/font/google";

/**
 * Three roles, three faces (docs/design.md: "Bubble Ink"):
 *  - display: Baloo 2     — headings, wordmark, empty states. Chunky, round, bold.
 *  - ui:      Nunito Sans — chrome: nav, buttons, forms, labels.
 *  - reading: Literata    — all language content ([lang] spans, story body, cards).
 * The serif-for-language rule survives the playful pivot: serif marks language,
 * sans marks interface. latin-ext covers es/fr/de diacritics.
 */

export const baloo = Baloo_2({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-baloo",
});

export const nunito = Nunito_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-nunito",
});

export const literata = Literata({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-literata",
  axes: ["opsz"],
});
