"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Event kinds the analytics endpoint accepts. */
export type AnalyticsEventType = "view" | "search" | "ask";

interface LogEventData {
  path?: string;
  query?: string;
  meta?: Record<string, string | number>;
}

/**
 * Fire-and-forget a usage event to the local analytics endpoint. Never throws,
 * never blocks the UI, and never awaits — a failed log must be invisible to the
 * user. `keepalive` lets the request survive a navigation/unload.
 */
export function logEvent(type: AnalyticsEventType, data?: LogEventData): void {
  try {
    void fetch("/api/analytics", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...data }),
    }).catch(() => {});
  } catch {
    // Some environments throw synchronously (e.g. no fetch) — swallow it.
  }
}

/**
 * Invisible client component that logs a `view` event for the current pathname
 * on mount and whenever the route changes. Mount once, high in the tree (e.g.
 * in the root layout). Renders nothing.
 */
export function NavBeacon(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) logEvent("view", { path: pathname });
  }, [pathname]);

  return null;
}
