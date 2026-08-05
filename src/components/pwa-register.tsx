"use client";

import { useEffect } from "react";

/**
 * Registers the hand-written service worker (`public/sw.js`) once, on the client,
 * in production. Renders nothing. The SW gives the app offline reads + makes it
 * installable alongside the web manifest. Skipped in development so hot-reloaded
 * pages are never served from a stale cache.
 */
export function PwaRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort — never surface an error to the user.
      });
    };
    // Wait for load so SW registration doesn't contend with initial page work.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
