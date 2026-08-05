"use client";

import { useEffect } from "react";

import { dirMeta, TYPE_LABEL } from "@/lib/wiki/labels";
import type { WikiType } from "@/lib/wiki/types";

/** Compact payload returned by `GET /api/preview/[slug]`. */
interface PreviewPayload {
  slug: string;
  title: string;
  type: WikiType;
  dir: string;
  excerpt: string;
  backlinkCount: number;
}

/** Delay before a hovered link opens its preview (ms). */
const HOVER_DELAY = 350;
/** Grace period after leaving a link before the card hides (ms) — lets the
 * pointer travel into the card without dismissing it. */
const GRACE_DELAY = 220;
/** Pixels between the link and the card, and from the viewport edges. */
const GAP = 8;
const MARGIN = 12;

/** Find the resolvable wikilink anchor for an event target, if any. */
function findWikilink(node: EventTarget | null): HTMLAnchorElement | null {
  if (!(node instanceof Element)) return null;
  const anchor = node.closest("a.wikilink");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  // Unresolved links render as `<span class="wikilink wikilink--missing">`, so
  // they never match `a.wikilink`; guard defensively regardless.
  if (anchor.classList.contains("wikilink--missing")) return null;
  return anchor;
}

/** Parse the note slug out of a `/wiki/<slug>` href. */
function slugFromHref(href: string | null): string | null {
  if (!href) return null;
  const match = /^\/wiki\/([^/?#]+)/.exec(href);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Global, delegated hover-preview handler for `[[wikilinks]]`.
 *
 * Mount once (e.g. in the root layout). It attaches document-level listeners
 * that detect when the pointer or keyboard focus lands on a resolved wikilink,
 * fetches a compact summary after a short delay, and shows a themed card near
 * the link — Obsidian/Wikipedia style. It renders its UI imperatively into a
 * fixed-position element appended to `<body>`, so the component returns `null`.
 *
 * No-ops on coarse-pointer (touch) devices. Never throws.
 */
export function WikilinkHover(): null {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    // Touch devices have no meaningful hover — skip entirely.
    if (!window.matchMedia("(hover: hover)").matches) return;

    const cache = new Map<string, PreviewPayload>();

    // ---- The card element (created once, reused, hidden between shows). ----
    const card = document.createElement("div");
    card.setAttribute("role", "tooltip");
    card.style.display = "none";
    card.className =
      "pointer-events-auto fixed left-0 top-0 z-50 w-[320px] max-w-[calc(100vw-24px)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10";
    document.body.appendChild(card);

    // ---- Transient state shared across the handlers below. ----
    let activeLink: HTMLAnchorElement | null = null;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let reqToken = 0;

    const clearTimers = () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      showTimer = undefined;
      hideTimer = undefined;
    };

    const hide = () => {
      activeLink = null;
      reqToken += 1; // invalidate any in-flight fetch
      card.style.display = "none";
      card.replaceChildren();
    };

    const scheduleHide = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, GRACE_DELAY);
    };

    /** Build the card contents from a payload (textContent-safe). */
    const render = (data: PreviewPayload) => {
      const meta = dirMeta(data.dir);
      card.replaceChildren();

      const header = document.createElement("div");
      header.className = "flex items-center gap-1.5 text-xs text-muted-foreground";

      const dot = document.createElement("span");
      dot.className = "inline-block size-2 shrink-0 rounded-full";
      dot.style.backgroundColor = meta.accent;
      header.appendChild(dot);

      const typeLabel = document.createElement("span");
      typeLabel.className = "font-medium text-foreground";
      typeLabel.textContent = TYPE_LABEL[data.type];
      header.appendChild(typeLabel);

      if (meta.label) {
        const sep = document.createElement("span");
        sep.textContent = "·";
        header.appendChild(sep);
        const dirLabel = document.createElement("span");
        dirLabel.textContent = meta.label;
        header.appendChild(dirLabel);
      }
      card.appendChild(header);

      const title = document.createElement("div");
      title.className = "mt-1.5 text-sm font-medium leading-snug text-foreground";
      title.textContent = data.title;
      card.appendChild(title);

      if (data.excerpt) {
        const excerpt = document.createElement("p");
        excerpt.className = "mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground";
        excerpt.textContent = data.excerpt;
        card.appendChild(excerpt);
      }

      const footer = document.createElement("div");
      footer.className = "mt-2 border-t pt-2 text-xs text-muted-foreground";
      const n = data.backlinkCount;
      footer.textContent = `${n} ${n === 1 ? "backlink" : "backlinks"}`;
      card.appendChild(footer);
    };

    /** Show the (already-populated) card anchored to a link. */
    const positionTo = (link: HTMLAnchorElement) => {
      card.style.display = "block";
      const rect = link.getBoundingClientRect();
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;

      // Prefer below the link; flip above when it would overflow the bottom.
      let top = rect.bottom + GAP;
      if (top + ch > window.innerHeight - MARGIN) {
        const above = rect.top - GAP - ch;
        top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - MARGIN - ch);
      }

      // Left-align to the link, then clamp within the viewport.
      let left = rect.left;
      if (left + cw > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - cw;
      if (left < MARGIN) left = MARGIN;

      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    };

    /** Fetch (or read cache) then show the preview for a link. */
    const openFor = (link: HTMLAnchorElement) => {
      if (activeLink !== link) return;
      const slug = slugFromHref(link.getAttribute("href"));
      if (!slug) return;

      const token = ++reqToken;
      const cached = cache.get(slug);
      if (cached) {
        render(cached);
        positionTo(link);
        return;
      }

      fetch(`/api/preview/${encodeURIComponent(slug)}`)
        .then((res) => (res.ok ? (res.json() as Promise<PreviewPayload>) : null))
        .then((data) => {
          // Ignore stale responses (moved away, or a newer request superseded).
          if (!data || token !== reqToken || activeLink !== link) return;
          cache.set(slug, data);
          render(data);
          positionTo(link);
        })
        .catch(() => {
          // Network/parse failure: silently leave the card hidden.
        });
    };

    const enter = (link: HTMLAnchorElement) => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = undefined;
      if (link === activeLink) return; // already showing / pending for this link
      activeLink = link;
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(() => openFor(link), HOVER_DELAY);
    };

    const leave = () => {
      if (showTimer) clearTimeout(showTimer);
      showTimer = undefined;
      scheduleHide();
    };

    // ---- Delegated document listeners. ----
    const onOver = (event: MouseEvent) => {
      const link = findWikilink(event.target);
      if (link) enter(link);
    };

    const onOut = (event: MouseEvent) => {
      const link = findWikilink(event.target);
      if (!link) return;
      // Keep the card alive if the pointer moved into the card or stayed within
      // the same link (e.g. crossing child text nodes).
      const to = event.relatedTarget;
      if (to instanceof Node && (card.contains(to) || link.contains(to))) return;
      leave();
    };

    const onFocusIn = (event: FocusEvent) => {
      const link = findWikilink(event.target);
      if (link) enter(link);
    };

    const onFocusOut = (event: FocusEvent) => {
      const link = findWikilink(event.target);
      if (link) leave();
    };

    // ---- Keep the card open while the pointer is over it. ----
    const onCardEnter = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = undefined;
    };
    const onCardLeave = () => scheduleHide();

    // Dismiss on scroll/resize — the anchor rect goes stale.
    const onDismiss = () => {
      if (activeLink) hide();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    card.addEventListener("mouseenter", onCardEnter);
    card.addEventListener("mouseleave", onCardLeave);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);

    return () => {
      clearTimers();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      card.removeEventListener("mouseenter", onCardEnter);
      card.removeEventListener("mouseleave", onCardLeave);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
      card.remove();
    };
  }, []);

  return null;
}
