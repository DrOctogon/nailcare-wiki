# Vault Explorer — Design System ("Lacquer & Ledger")

A private, *compounding* research archive rendered with editorial discipline.
Identity sources: the **archive/ledger** (provenance, catalog cards, backlinks)
and **nail lacquer** (the industry's signature material — deep, saturated,
deliberate). The foundation (tokens + fonts + signature) lives in
`src/app/globals.css` and `src/app/layout.tsx` — **do not edit those**; apply the
system below in page/component TSX only.

## Palette (CSS tokens — never hard-code hex)
- `--background` cool archival paper (light) / deep ink-navy (dark)
- `--foreground` ink (light) / warm paper (dark)
- `--primary` = **lacquer oxblood** — the single accent. Buttons, active nav,
  focus ring, chart-1, the lacquer tick. Use sparingly.
- `--muted-foreground` metadata/secondary text
- `--border` hairline. Charts: `--chart-1..5` (harmonized, muted).
- Never introduce new colors. Bootstrap accents come only from the tokens.

## Type roles
- **Display — Fraunces serif** via `.font-display`. All page titles + hero +
  section headings. Editorial, characterful. Used with restraint.
- **UI — Hanken Grotesk** (default `font-sans`). Body UI, buttons, nav, controls.
- **Reading — Newsreader serif** (`.wiki-prose`, or `.font-reading`). Note prose
  + long-form intros. Reads like a research document.
- **Data — Geist Mono** (`font-mono`). Catalog-card metadata, kbd, numbers.

## Signature (the one memorable element — keep everything else quiet)
- `.lacquer-tick` — a short brushed lacquer mark above an eyebrow or section
  title. Use once per major section, not everywhere.
- `.catalog-meta` — mono, uppercase, letter-spaced. Use for: eyebrows, note
  provenance rows (type · date · backlinks), section labels ("ON THIS PAGE",
  "RELATED"), data captions. This is the library-card voice.
- Wikilinks are underlined in lacquer (already global).

## Application rules
1. **Page titles → `.font-display`** (currently many are sans `font-semibold` —
   convert). Section headings (`h2`) → `.font-display` at a smaller size.
2. **Eyebrows / labels / metadata → `.catalog-meta`** (replace ad-hoc
   `text-xs uppercase text-muted-foreground` with `.catalog-meta`).
3. **One `.lacquer-tick`** per page's primary header/eyebrow — not on every card.
4. Reduce border-radius noise; prefer hairline `border` + generous whitespace
   over heavy shadows. `--radius` is 0.5rem.
5. **Mobile is a deliverable**: every surface must be verified at 390px — no
   horizontal overflow, tap targets ≥40px, headings wrap gracefully, toolbars
   collapse/wrap.
6. Preserve component APIs, structure, `data-slot`s, and all existing behavior —
   this is a visual/UX pass, not a refactor. Keep a11y (focus-visible, labels)
   and `prefers-reduced-motion`.
7. Do NOT touch `globals.css`, `layout.tsx`, tests, or CI config.

## Restraint
Spend boldness on the display type + lacquer signature. Everything else stays
disciplined: quiet cards, hairline rules, consistent spacing, no decoration that
doesn't encode meaning.
