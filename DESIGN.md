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

## Material & motion primitives (globals.css — use, don't redefine)
The foundation now carries the depth layer. Apply these; never re-implement them
inline or add competing shadows/animation.
- **Card depth is automatic.** Every `[data-slot="card"]` gets `--shadow-card`
  and lifts on hover when it's the direct child of a hovered `<a>`/`.group`.
  Don't add `shadow-*` utilities to cards; don't fight the lift. Cards read as
  clean stock floating above a faint ledger-dot ground (`body` background).
- **`.hero-glow`** — one soft lacquer wash, used **once**, on a page's primary
  hero header (dashboard uses it). Do not sprinkle it on sections/cards.
- **`.reveal`** + `.reveal-1..5` — a quiet staggered fade-up. Put `.reveal` on
  above-the-fold sections/grids, staggering with the numbered delay classes
  (hero=`.reveal`, next=`.reveal reveal-2`, …). Use sparingly — entrance only,
  not on every element, never on content the user scrolls back to repeatedly.
  `prefers-reduced-motion` already neutralizes it.
- **Status badges**: prefer soft tinted badges (tint bg + colored text +
  hairline), not heavy solid-dark pills. Keep them quiet against the cards.

## Restraint
Spend boldness on the display type + lacquer signature + the one hero glow.
Everything else stays disciplined: quiet elevated cards, hairline rules,
consistent spacing, tinted (not solid) status chips, no decoration that doesn't
encode meaning. Chanel rule — after each surface, remove one accessory.
