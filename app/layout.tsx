import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaSetup from "../src/components/PwaSetup";
import MotionProvider from "../src/components/motion/MotionProvider";
import { baloo, nunito, literata } from "./fonts";
import { PAPER_BG_HEX, INK_BG_HEX } from "../src/design/colors";

export const metadata: Metadata = {
  title: "pylgrim",
  description: "Story-based language learning: say what you're about to do, read the story that rehearses it.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAPER_BG_HEX },
    { media: "(prefers-color-scheme: dark)", color: INK_BG_HEX },
  ],
};

// Runs before paint: applies a manually chosen theme so a stored preference
// never flashes the wrong background. Absent/["system"] = follow the OS.
const themeInit = `(function(){try{var t=localStorage.getItem("pylgrim-theme");
if(t==="paper"||t==="ink"){document.documentElement.dataset.theme=t;
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute("content",t==="ink"?"${INK_BG_HEX}":"${PAPER_BG_HEX}");}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${baloo.variable} ${nunito.variable} ${literata.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <PwaSetup />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
