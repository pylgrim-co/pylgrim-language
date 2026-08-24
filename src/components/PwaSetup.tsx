"use client";

import { useEffect } from "react";

/** Registers the service worker. Production only — a SW caching dev-server
 *  responses makes local development maddening. In dev we go further and
 *  actively unregister any SW left over from a previous production run on
 *  this origin (plus its caches), since a stale cache-first worker will
 *  otherwise serve outdated chunks to the dev server forever. */
export default function PwaSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) if (key.startsWith("pylgrim-")) void caches.delete(key);
        });
      }
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline-first is progressive enhancement, never a blocker */
    });
  }, []);
  return null;
}
