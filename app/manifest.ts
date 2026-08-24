import type { MetadataRoute } from "next";
import { PAPER_BG_HEX } from "../src/design/colors";

// The manifest is paper-only by design: install/splash chrome takes a single
// static color, and paper is the brand surface (docs/design.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pylgrim",
    short_name: "pylgrim",
    description: "Story-based language learning: say what you're about to do, read the story that rehearses it.",
    start_url: "/",
    display: "standalone",
    background_color: PAPER_BG_HEX,
    theme_color: PAPER_BG_HEX,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
