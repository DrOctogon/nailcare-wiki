import fs from "node:fs/promises";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { getPage } from "@/lib/wiki/vault";
import { NoteEditor } from "@/components/wiki/note-editor";

interface EditPageProps {
  params: Promise<{ slug: string }>;
}

// Always render on demand so the editor loads the note's current bytes from
// disk (this is a live, local-only editing surface — not a static page).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: EditPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return { title: `Edit · ${page.title}` };
}

export default async function EditNotePage({ params }: EditPageProps) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  let raw: string;
  let mtimeMs = 0;
  try {
    [raw, mtimeMs] = await Promise.all([
      fs.readFile(page.filePath, "utf8"),
      fs.stat(page.filePath).then((s) => s.mtimeMs),
    ]);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <header className="mb-6">
        <Link
          href={`/wiki/${page.slug}`}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          {page.dir || "wiki"}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          Editing {page.title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Changes write to your local Obsidian vault after an explicit confirm.
        </p>
      </header>

      <NoteEditor
        slug={page.slug}
        title={page.title}
        initialContent={raw}
        initialMtimeMs={mtimeMs}
      />
    </div>
  );
}
