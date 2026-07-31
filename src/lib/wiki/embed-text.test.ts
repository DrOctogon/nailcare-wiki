import { describe, it, expect } from "vitest";
import { cleanBody, chunkText, noteHash } from "./embed-text";

describe("cleanBody", () => {
  it("strips fenced code blocks", () => {
    const out = cleanBody("before\n```\nconst x = 1;\n```\nafter");
    expect(out).toBe("before after");
    expect(out).not.toContain("const");
  });

  it("resolves wikilinks to their label (piped alias wins)", () => {
    expect(cleanBody("See [[Gel Polish]] now")).toBe("See Gel Polish now");
    expect(cleanBody("See [[gel-polish|Gel Polish]] now")).toBe(
      "See Gel Polish now",
    );
  });

  it("resolves markdown links to their text", () => {
    expect(cleanBody("read [the docs](https://example.com/x) here")).toBe(
      "read the docs here",
    );
  });

  it("strips heading markers but keeps the heading text", () => {
    expect(cleanBody("# Title\nbody text")).toBe("Title body text");
    expect(cleanBody("### Deep Heading")).toBe("Deep Heading");
  });

  it("removes markdown symbols and collapses whitespace", () => {
    const out = cleanBody("**bold**   _em_\t`code`\n\n> quote");
    expect(out).toBe("bold em code quote");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(cleanBody("   \n\t  ")).toBe("");
  });
});

describe("chunkText", () => {
  it("returns a single chunk when text is at or under size", () => {
    expect(chunkText("short text", 900)).toEqual(["short text"]);
  });

  it("returns [] for empty or whitespace-only text", () => {
    expect(chunkText("", 900)).toEqual([]);
    expect(chunkText("    \n\t ", 900)).toEqual([]);
  });

  it("splits long text into overlapping windows on word boundaries", () => {
    // size 5, overlap 2 — deterministic given single-char words.
    expect(chunkText("a b c d e f", 5, 2)).toEqual(["a b c", "c d e", "e f"]);
  });

  it("keeps each window within the size bound and drops empties", () => {
    const text = Array.from({ length: 300 }, (_v, i) => `word${i}`).join(" ");
    const chunks = chunkText(text, 900, 150);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      expect(chunk.length).toBeLessThanOrEqual(900);
    }
    // Overlap duplicates some words, so the combined word count exceeds the
    // original's.
    const combinedWords = chunks.reduce(
      (acc, c) => acc + c.split(/\s+/).length,
      0,
    );
    expect(combinedWords).toBeGreaterThanOrEqual(300);
  });
});

describe("noteHash", () => {
  it("is deterministic: same input → same hash", () => {
    expect(noteHash("hello world")).toBe(noteHash("hello world"));
  });

  it("differs for different input", () => {
    expect(noteHash("hello world")).not.toBe(noteHash("hello worlds"));
  });

  it("returns a 64-character lowercase hex string (sha256)", () => {
    const hash = noteHash("anything");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
