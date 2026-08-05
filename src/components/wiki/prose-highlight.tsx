"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Highlights the `?hl=<text>` snippet inside the rendered `.wiki-prose` article
 * and scrolls it into view. Used by "Ask the Vault" citation links so a reader
 * lands on the exact sentence the answer was drawn from.
 *
 * Renders nothing — all work happens in a DOM effect after hydration, so it is
 * purely additive and never changes how the server-rendered markdown looks.
 */

/** Marker class used both to style the highlight and to find it for cleanup. */
const HIGHLIGHT_CLASS = "data-vault-highlight";

/** Tailwind tokens applied to the injected <mark>. */
const HIGHLIGHT_TAILWIND =
  "bg-yellow-200/70 dark:bg-yellow-400/30 rounded px-0.5";

/** Length of the prefix fallback when the full snippet does not fit one node. */
const PREFIX_LENGTH = 60;

/** Collapse runs of whitespace so matching survives markdown/HTML reflow. */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

interface TextMatch {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

/**
 * Walk the text nodes under `container` and find the first case-insensitive
 * occurrence of `needle` (whitespace-normalized) that fits within a single
 * text node. Returns the raw (un-normalized) offsets into that node.
 */
function findFirstMatch(container: Element, needle: string): TextMatch | null {
  const normalizedNeedle = normalizeWhitespace(needle).toLowerCase();
  if (normalizedNeedle.length === 0) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  let current = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    const raw = textNode.data;
    const normalized = normalizeWhitespace(raw).toLowerCase();
    const normalizedIndex = normalized.indexOf(normalizedNeedle);

    if (normalizedIndex !== -1) {
      const offsets = mapNormalizedRangeToRaw(
        raw,
        normalizedIndex,
        normalizedNeedle.length,
      );
      if (offsets !== null) {
        return { node: textNode, start: offsets.start, end: offsets.end };
      }
    }

    current = walker.nextNode();
  }

  return null;
}

/**
 * Translate a [start, length) range expressed in normalized-whitespace space
 * back into raw character offsets within `raw`, so the DOM Range lands on the
 * real characters even when the source has collapsed/newline whitespace.
 */
function mapNormalizedRangeToRaw(
  raw: string,
  normalizedStart: number,
  normalizedLength: number,
): { start: number; end: number } | null {
  const normalizedEnd = normalizedStart + normalizedLength;
  let normalizedPos = 0;
  let rawStart = -1;
  let rawEnd = -1;
  let previousWasSpace = false;
  // Leading whitespace is trimmed in normalized space; skip it here too.
  let seenNonSpace = false;

  for (let i = 0; i < raw.length; i += 1) {
    const isSpace = /\s/.test(raw[i]);

    if (isSpace) {
      if (!seenNonSpace) continue; // matches leading trim()
      if (previousWasSpace) continue; // collapsed run contributes one space
      previousWasSpace = true;
    } else {
      seenNonSpace = true;
      previousWasSpace = false;
    }

    if (normalizedPos === normalizedStart && rawStart === -1) {
      rawStart = i;
    }
    if (normalizedPos === normalizedEnd) {
      rawEnd = i;
      break;
    }

    normalizedPos += 1;
  }

  if (rawStart === -1) return null;
  if (rawEnd === -1) rawEnd = raw.length;
  if (rawEnd <= rawStart) return null;

  return { start: rawStart, end: rawEnd };
}

/** Wrap the matched range in a <mark>, returning it (or null on failure). */
function wrapMatch(match: TextMatch): HTMLElement | null {
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.end);

  const mark = document.createElement("mark");
  mark.className = HIGHLIGHT_TAILWIND;
  mark.setAttribute(HIGHLIGHT_CLASS, "true");

  range.surroundContents(mark);
  return mark;
}

/** Effect body: locate the snippet, highlight it, scroll it into view. */
function highlight(hl: string): HTMLElement | null {
  const container = document.querySelector(".wiki-prose");
  if (container === null) return null;

  const match =
    findFirstMatch(container, hl) ??
    findFirstMatch(container, hl.slice(0, PREFIX_LENGTH));
  if (match === null) return null;

  const mark = wrapMatch(match);
  if (mark === null) return null;

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  mark.scrollIntoView({
    block: "center",
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });

  return mark;
}

/**
 * Remove a <mark> we added, restoring its original text so client navigations
 * never leave a stale highlight behind.
 */
function removeMark(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (parent === null) return;

  while (mark.firstChild !== null) {
    parent.insertBefore(mark.firstChild, mark);
  }
  parent.removeChild(mark);
  parent.normalize();
}

function ProseHighlightInner(): null {
  const searchParams = useSearchParams();
  const hl = searchParams.get("hl")?.trim() ?? "";

  useEffect(() => {
    if (hl.length === 0) return;

    let mark: HTMLElement | null = null;
    try {
      mark = highlight(hl);
    } catch {
      // A failed highlight must never break the page — swallow silently.
      mark = null;
    }

    return () => {
      try {
        if (mark !== null) removeMark(mark);
      } catch {
        // Ignore cleanup failures.
      }
    };
  }, [hl]);

  return null;
}

/**
 * `useSearchParams()` requires a Suspense boundary during prerender under
 * Next 16, so the searchParams-reading logic is wrapped here and this export
 * is safe to mount directly in a Server Component.
 */
export function ProseHighlight(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <ProseHighlightInner />
    </Suspense>
  );
}
