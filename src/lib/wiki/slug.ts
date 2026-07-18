// Pure slug/title helpers. No server-only imports — safe to use from the
// Next.js app AND from the standalone embedding script, so both derive
// identical slugs for the same page (semantic neighbors would silently point
// at the wrong pages if these ever diverged).

export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "page"
  );
}

export function normalizeTitle(input: string): string {
  return input.trim().toLowerCase();
}
