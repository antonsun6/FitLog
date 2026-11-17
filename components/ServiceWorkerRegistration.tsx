"use client";

import { useEffect } from "react";

/** Registers public/sw.js — see that file for why it's deliberately a
 * no-op pass-through rather than an offline cache. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    }
  }, []);

  return null;
}
