import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";

import { AskPanel } from "@/components/wiki/ask-panel";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const metadata: Metadata = {
  title: "Ask the Vault",
  description:
    "Ask questions and get answers grounded in your own notes, using a local LLM — nothing leaves your machine.",
};

export default function AskPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Ask the Vault</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-8">
        <p className="catalog-meta lacquer-tick">Local retrieval-augmented Q&amp;A</p>
        <h1 className="font-display mt-1 flex items-center gap-2.5 text-3xl text-balance md:text-4xl">
          <MessageCircleQuestion className="text-chart-1 h-8 w-8" />
          Ask the Vault
        </h1>
        <p className="text-muted-foreground mt-3 text-lg">
          Ask a question and get an answer grounded in your own notes. Retrieval
          and the language model both run locally on your machine — nothing
          leaves it.
        </p>
      </header>

      <AskPanel />
    </div>
  );
}
