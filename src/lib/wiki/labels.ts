// Client-safe presentation metadata for wiki types and collections.
// No server-only imports here — components on both sides use it.

import type { WikiType } from "./types";

export interface DirMeta {
  dir: string;
  label: string;
  singular: string;
  description: string;
  /** Tailwind classes for the accent chip (light + dark handled by tokens). */
  accent: string;
}

/** Ordered collections shown in navigation and the dashboard. */
export const DIR_META: Record<string, DirMeta> = {
  concepts: {
    dir: "concepts",
    label: "Concepts",
    singular: "Concept",
    description: "Ideas, mechanisms, and models distilled from the research.",
    accent: "var(--chart-1)",
  },
  entities: {
    dir: "entities",
    label: "Entities",
    singular: "Entity",
    description: "Brands, products, people, and organizations.",
    accent: "var(--chart-2)",
  },
  sources: {
    dir: "sources",
    label: "Sources",
    singular: "Source",
    description: "Primary references the knowledge is grounded in.",
    accent: "var(--chart-3)",
  },
  questions: {
    dir: "questions",
    label: "Questions",
    singular: "Question",
    description: "Open research threads and deep-dive investigations.",
    accent: "var(--chart-4)",
  },
  comparisons: {
    dir: "comparisons",
    label: "Comparisons",
    singular: "Comparison",
    description: "Side-by-side analyses across the vault.",
    accent: "var(--chart-5)",
  },
  derived: {
    dir: "derived",
    label: "Derived",
    singular: "Derived note",
    description: "Synthesized higher-order notes built from many pages.",
    accent: "var(--chart-1)",
  },
  references: {
    dir: "references",
    label: "References",
    singular: "Reference",
    description: "External reference material.",
    accent: "var(--chart-3)",
  },
};

export const DIR_ORDER = [
  "concepts",
  "entities",
  "sources",
  "questions",
  "comparisons",
  "derived",
  "references",
];

export function dirMeta(dir: string): DirMeta {
  return (
    DIR_META[dir] ?? {
      dir,
      label: dir ? dir[0].toUpperCase() + dir.slice(1) : "Pages",
      singular: "Page",
      description: "",
      accent: "var(--muted-foreground)",
    }
  );
}

/** Status pill styling — keyed by common Obsidian status values. */
export function statusVariant(
  status: string | null,
): "default" | "secondary" | "outline" {
  if (!status) return "outline";
  const s = status.toLowerCase();
  if (s === "evergreen" || s === "stable" || s === "verified") return "default";
  if (s === "developing" || s === "growing") return "secondary";
  return "outline";
}

export const TYPE_LABEL: Record<WikiType, string> = {
  entity: "Entity",
  concept: "Concept",
  source: "Source",
  question: "Question",
  comparison: "Comparison",
  derived: "Derived",
  reference: "Reference",
  fold: "Fold",
  meta: "Meta",
  unknown: "Note",
};
