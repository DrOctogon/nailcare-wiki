# Vault Explorer

A beautifully crafted web explorer for a compounding Obsidian knowledge vault —
built with **Next.js 16 (App Router)**, **Tailwind v4**, and **shadcn/ui**.

It renders the sibling [`claude-obsidian`](../claude-obsidian) vault (~340 interlinked
research notes) as a browsable knowledge garden: typed collections, wikilink-aware
pages with backlinks, an interactive knowledge graph, tag exploration, keyword +
**semantic** search, and light/dark themes.

Everything runs **locally** and **offline** — the private vault content is never
sent anywhere. The only network access is downloading the (open) embedding-model
weights the first time semantic search or the embedding script runs.

## Features

- **Dashboard** — vault stats, collection cards, most-connected & recently-updated pages, tag cloud.
- **Collections** (`/browse/[dir]`) — filter/sort card grids per note type.
- **Page view** (`/wiki/[slug]`) — rendered markdown with resolved `[[wikilinks]]`,
  KaTeX math, Shiki-highlighted code, a table of contents, backlinks, and a
  "Related by meaning" rail from the embedding index.
- **Knowledge graph** (`/graph`) — Sigma/WebGL force graph, **colored by Louvain
  community** and **sized by PageRank** (all precomputed server-side).
- **Tags** (`/tags`, `/tags/[tag]`).
- **Search** — ⌘K palette with a Keyword (Fuse.js) / Semantic (local MiniLM
  embeddings) toggle.

## Getting started

```bash
pnpm install
pnpm embed      # optional: build the semantic index (see below)
pnpm dev        # http://localhost:3000
```

By default the app reads the vault at `../claude-obsidian/wiki`. Point elsewhere with:

```bash
WIKI_VAULT_PATH=/path/to/vault-root pnpm dev   # expects a wiki/ subdir
```

## Semantic index

`pnpm embed` runs [`scripts/embed-vault.ts`](scripts/embed-vault.ts): it embeds every
page locally with `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` and writes

- `src/lib/wiki/neighbors.json` — top-K semantic neighbors per page (powers the
  "Related by meaning" rail; imported at build time).
- `public/vault-vectors.json` — page vectors fetched on demand by the in-browser
  semantic search.

Re-run it after editing the vault to refresh the index. If it hasn't been run, the
app still works — the semantic rail is simply empty and keyword search is unaffected.

> `pnpm exec`/scripts run a dependency check that fails while native builds
> (`onnxruntime-node`, `esbuild`, `protobufjs`) are unapproved. If you hit that,
> run `pnpm approve-builds` then `pnpm install`, or invoke the binary directly:
> `node_modules/.bin/tsx scripts/embed-vault.ts`.

## Build

```bash
pnpm build      # static export of every page (~690 routes)
pnpm start
```

## Architecture

- `src/lib/wiki/` — the content layer. `vault.ts` globs the vault, parses
  frontmatter (`gray-matter`), renders markdown (`unified` + remark/rehype with a
  custom code-safe `[[wikilink]]` transform), and computes backlinks + the graph
  (Louvain communities, PageRank, ForceAtlas2 layout via `graphology`). A single
  module-level promise parses the vault once per build worker.
- `src/components/wiki/` — reusable presentation (page cards, TOC, backlinks,
  Sigma graph, semantic search).
- `src/app/` — routes, all statically generated.
