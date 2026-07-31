import { describe, it, expect } from "vitest";
import { slugify, normalizeTitle } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Gel vs Acrylic")).toBe("gel-vs-acrylic");
  });

  it("strips diacritics (Café → cafe)", () => {
    expect(slugify("Café")).toBe("cafe");
    expect(slugify("naïve résumé")).toBe("naive-resume");
    expect(slugify("Zürich")).toBe("zurich");
  });

  it("removes apostrophes and quotes without inserting a separator", () => {
    expect(slugify("O'Brien's")).toBe("obriens");
    expect(slugify('the "best" salon')).toBe("the-best-salon");
  });

  it("removes other punctuation by collapsing to a single hyphen", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("a & b / c")).toBe("a-b-c");
  });

  it("collapses multiple separators into one hyphen", () => {
    expect(slugify("a   b")).toBe("a-b");
    expect(slugify("a---b")).toBe("a-b");
    expect(slugify("a _ - _ b")).toBe("a-b");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  spaced  ")).toBe("spaced");
    expect(slugify("---edges---")).toBe("edges");
    expect(slugify("!!!bang!!!")).toBe("bang");
  });

  it("preserves digits", () => {
    expect(slugify("llama3.2 3b model")).toBe("llama3-2-3b-model");
  });

  it("falls back to 'page' for empty or all-punctuation input", () => {
    expect(slugify("")).toBe("page");
    expect(slugify("   ")).toBe("page");
    expect(slugify("!!!")).toBe("page");
    // Emoji / non-latin that reduce to nothing after stripping.
    expect(slugify("🎉")).toBe("page");
  });

  it("drops unicode that has no ASCII decomposition", () => {
    // CJK characters have no NFKD ASCII form, so they are removed entirely.
    expect(slugify("日本語")).toBe("page");
    // Mixed: latin survives, CJK is dropped.
    expect(slugify("Tokyo 東京")).toBe("tokyo");
  });

  it("truncates to at most 96 characters", () => {
    const long = "a".repeat(200);
    const result = slugify(long);
    expect(result.length).toBe(96);
    expect(result).toBe("a".repeat(96));
  });

  it("is idempotent on already-slugified input", () => {
    const once = slugify("Some Complex Title!");
    expect(slugify(once)).toBe(once);
  });
});

describe("normalizeTitle", () => {
  it("lowercases and trims", () => {
    expect(normalizeTitle("  Gel Vs Acrylic  ")).toBe("gel vs acrylic");
  });

  it("preserves interior spacing and punctuation (unlike slugify)", () => {
    expect(normalizeTitle("O'Brien's Salon")).toBe("o'brien's salon");
    expect(normalizeTitle("A & B")).toBe("a & b");
  });

  it("returns empty string for empty / whitespace-only input", () => {
    expect(normalizeTitle("")).toBe("");
    expect(normalizeTitle("   ")).toBe("");
  });

  it("matches case-and-whitespace variants of the same title", () => {
    expect(normalizeTitle("Nail Care")).toBe(normalizeTitle("  nail care  "));
  });

  it("is idempotent", () => {
    const once = normalizeTitle("  Mixed Case Title ");
    expect(normalizeTitle(once)).toBe(once);
  });
});
