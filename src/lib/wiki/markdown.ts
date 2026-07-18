import "server-only";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeShiki from "@shikijs/rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import type { Root as MdastRoot } from "mdast";
import type { Root as HastRoot, Element } from "hast";
import type { WikiLink } from "./types";

export type Resolver = (target: string) => string | null;

interface Heading {
  id: string;
  text: string;
  depth: number;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const WIKILINK_RE = /\[\[([^\]]+?)\]\]/g;

/** Parse the inside of [[ ]] into a target/label pair (heading anchor stripped). */
export function parseWikiTarget(inner: string): { target: string; label: string } {
  const pipe = inner.indexOf("|");
  const rawTarget = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? null : inner.slice(pipe + 1);
  const target = rawTarget.split("#")[0].trim();
  const label = (alias ?? rawTarget).trim();
  return { target, label };
}

/**
 * Remark plugin: rewrite [[wikilinks]] found in text nodes into real links.
 * Because it visits only `text` nodes, links inside code spans/blocks are left
 * untouched. Resolved links become internal anchors; unresolved links render as
 * a marked span. Every resolved link is pushed to `sink` for backlink building.
 */
function remarkWikiLinks(resolve: Resolver, sink: WikiLink[]) {
  return (tree: MdastRoot) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index == null || !node.value.includes("[[")) return;

      const value = node.value;
      const replacement: MdastRoot["children"] = [];
      let last = 0;
      let match: RegExpExecArray | null;
      WIKILINK_RE.lastIndex = 0;

      while ((match = WIKILINK_RE.exec(value))) {
        if (match.index > last) {
          replacement.push({ type: "text", value: value.slice(last, match.index) });
        }
        const { target, label } = parseWikiTarget(match[1]);
        const slug = resolve(target);
        sink.push({ target, label, slug });

        if (slug) {
          replacement.push({
            type: "link",
            url: `/wiki/${slug}`,
            title: null,
            children: [{ type: "text", value: label }],
            data: { hProperties: { className: ["wikilink"] } },
          });
        } else {
          replacement.push({
            type: "html",
            value: `<span class="wikilink wikilink--missing" title="Unresolved: ${escapeHtml(
              target,
            )}">${escapeHtml(label)}</span>`,
          });
        }
        last = match.index + match[0].length;
      }

      if (last < value.length) {
        replacement.push({ type: "text", value: value.slice(last) });
      }

      parent.children.splice(index, 1, ...replacement);
      // Skip past the nodes we just inserted so we don't reprocess them.
      return [SKIP, index + replacement.length];
    });
  };
}

function hastText(node: Element): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else if (child.type === "element") out += hastText(child);
  }
  return out;
}

/** Rehype plugin: collect heading id/text/depth for a table of contents. */
function rehypeCollectHeadings(sink: Heading[]) {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      const m = /^h([1-6])$/.exec(node.tagName);
      if (!m) return;
      const id = node.properties?.id;
      if (typeof id !== "string") return;
      sink.push({ id, text: hastText(node).trim(), depth: Number(m[1]) });
    });
  };
}

export interface RenderResult {
  html: string;
  headings: Heading[];
  links: WikiLink[];
}

/** Render Obsidian-flavoured markdown to HTML, resolving wikilinks. */
export async function renderMarkdown(
  body: string,
  resolve: Resolver,
): Promise<RenderResult> {
  const links: WikiLink[] = [];
  const headings: Heading[] = [];

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    // Only treat `$$…$$` blocks as math. Single-dollar inline math is disabled
    // because the vault is full of dollar amounts ($82k, $16.66/hr) that would
    // otherwise be parsed as (broken) LaTeX.
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkWikiLinks, resolve, links)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeShiki, {
      // Dual theme: emits CSS variables so light/dark both look right.
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    })
    .use(rehypeSlug)
    .use(rehypeCollectHeadings, headings)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(body);

  return { html: String(file), headings, links };
}
