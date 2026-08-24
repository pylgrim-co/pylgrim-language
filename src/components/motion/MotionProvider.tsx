"use client";

import { LazyMotion, domMax, MotionConfig } from "motion/react";
import { EASE_OUT, DUR_BASE } from "./primitives";

/**
 * One motion context for the whole app. domMax is loaded once (layout
 * animations need it for the tab underline); reducedMotion="user" honours
 * the OS setting for every m.* component.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: DUR_BASE, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
