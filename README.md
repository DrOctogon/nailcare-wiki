# Vault Explorer

A beautifully crafted web explorer for a compounding Obsidian knowledge vault —
built with **Next.js 16 (App Router / RSC)**, **Tailwind v4**, and **shadcn/ui**.

It renders the sibling [`claude-obsidian`](../claude-obsidian) vault (~340 interlinked
research notes) as a browsable knowledge garden: typed collections, wikilink-aware
pages with backlinks, an interactive knowledge graph, a growth timeline, dashboard
analytics, hybrid keyword+vector search, and a local-LLM **"Ask the Vault"** RAG chat.

Everything runs **locally** and **offline**. The private vault content is never sent
anywhere — retrieval, embeddings, and the LLM all run on your machine. The only
network access is downloading the (open) embedding-model weights the first time the
embedding script or in-browser search runs.

## Features

- **Dashboard** (`/`) — vault stats, collection cards, most-connected & recently-updated
  pages, tag cloud, and **analytics charts** (cumulative growth, collection sizes,
  backlink-connectivity histogram — hand-rolled SVG via d3).
- **Ask the Vault** (`/ask`) — a **multi-turn RAG chat** answered by a **local Ollama
  model**. Retrieves the most relevant note chunks in-browser, streams a grounded,
  markdown-rendered answer, cites its source notes, and lets you pick the model.
  Zero data egress. Degrades gracefully with setup hints if Ollama isn't running.
- **Collections** (`/browse/[dir]`) — filter/sort card grids per note type.
- **Page view** (`/wiki/[slug]`) — rendered markdown with resolved `[[wikilinks]]`,
  KaTeX math, Shiki-highlighted code, a table of contents, backlinks, and a
  "Related by meaning" rail from the embedding index.
- **Knowledge graph** (`/graph`) — Sigma/WebGL force graph, **colored by Louvain
  community** and **sized by PageRank** (all precomputed server-side).
- **Timeline** (`/timeline`) — month-bucketed view of the vault's growth over time.
- **Tags** (`/tags`, `/tags/[tag]`).
- **Search** — ⌘K palette with a **Keyword** (Fuse.js) / **Hybrid** toggle. Hybrid
  fuses BM25 keyword scoring with MiniLM vector similarity via an in-browser
  [Orama](https://oramasearch.com) index.

## Getting started

```bash
pnpm install
pnpm embed      # build the search / RAG indexes (see below)
pnpm dev        # http://localhost:3000
```

By default the app reads the vault at `../claude-obsidian/wiki`. Point elsewhere with:

```bash
WIKI_VAULT_PATH=/path/to/vault-root pnpm dev   # expects a wiki/ subdir
```

### Ask the Vault (local LLM)

The `/ask` chat talks to a local [Ollama](https://ollama.com) instance — no cloud, no
keys. To use it:

```bash
ollama serve            # start the local server
ollama pull llama3.2:3b # default model (fast); qwen3.5:9b also supported
```

Configure via env: `OLLAMA_HOST` (default `http://localhost:11434`), `OLLAMA_MODEL`
(default `llama3.2:3b`). The UI auto-detects availability and shows the exact command
to run if the server or model is missing.

> Note: reasoning models like `qwen3.5:9b` emit a long internal "thinking" phase
> before the answer, so expect a pause before text appears. `llama3.2:3b` is fast.

## Indexes (`pnpm embed`)

[`scripts/embed-vault.ts`](scripts/embed-vault.ts) embeds every page locally with
`Xenova/all-MiniLM-L6-v2` (384-dim) via `@huggingface/transformers` and writes:

- `src/lib/wiki/neighbors.json` — top-K semantic neighbors per page (powers the
  "Related by meaning" rail; imported at build time). *Committed.*
- `public/vault-vectors.json` — page vectors, fetched on demand by hybrid search.
  *Gitignored — run `pnpm embed`.*
- `public/vault-chunks.json` — ~2.6k overlapping note chunks + vectors, powering RAG
  retrieval for `/ask`. *Gitignored — run `pnpm embed`.*

Re-run after editing the vault to refresh all three. Without them the app still runs;
hybrid search and Ask degrade (empty results) while keyword search is unaffected.

> `pnpm exec`/scripts run a dependency check that fails while native builds
> (`onnxruntime-node`, `esbuild`, `protobufjs`) are unapproved. If you hit that,
> run `pnpm approve-builds` then `pnpm install`, or invoke the binary directly:
> `node_modules/.bin/tsx scripts/embed-vault.ts`.

## Build & test

```bash
pnpm build      # static export of every page (~700 routes)
pnpm start
pnpm test       # vitest — pure logic, API-route matrix, vault invariants
```

## Architecture

- `src/lib/wiki/` — the content + retrieval layer. `vault.ts` globs the vault, parses
  frontmatter (`gray-matter`), renders markdown (`unified` + remark/rehype with a
  custom code-safe `[[wikilink]]` transform, KaTeX, Shiki), and computes backlinks +
  the graph (Louvain communities, PageRank, ForceAtlas2 via `graphology`). A single
  module-level promise parses the vault once per build worker. `hybrid-search.ts` /
  `chunk-search.ts` / `semantic-search.ts` are the in-browser retrieval modules.
- `src/app/api/ask/route.ts` — streaming RAG endpoint proxying local Ollama
  (health check + validated POST → NDJSON→text stream, cancelled on disconnect).
- `src/components/wiki/` — presentation (page cards, TOC, backlinks, Sigma graph,
  charts, `ask-panel` chat).
- `src/app/` — routes; all static except the `/api/ask` streaming endpoint.
