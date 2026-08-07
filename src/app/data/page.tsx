import type { Metadata } from "next";

import { getSalonFacets } from "@/lib/scrape/salons";
import { NAIL_SCRAPE_DIR } from "@/lib/scrape/config";
import { SalonsExplorer } from "@/components/scrape/salons-explorer";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Salon locator dataset",
  description:
    "A live, local index of nail salons and technicians — filter, map, and sort provenance-tagged records.",
};

export default async function DataPage() {
  const facets = await getSalonFacets();

  if (facets.total === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <p className="catalog-meta lacquer-tick mb-3">Local dataset</p>
        <Card className="p-8">
          <h1 className="font-display text-2xl">Dataset not found</h1>
          <p className="text-muted-foreground font-reading mt-3 text-lg">
            The salon directory hasn’t been indexed yet. Point{" "}
            <code className="font-mono text-sm">NAIL_SCRAPE_PATH</code> at the
            dataset directory, or place the master file at the expected location:
          </p>
          <p className="catalog-meta bg-muted/40 mt-4 rounded-md border px-3 py-2 break-all">
            {NAIL_SCRAPE_DIR}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <header className="reveal mb-8">
        <p className="catalog-meta lacquer-tick mb-3">Local dataset</p>
        <h1 className="font-display max-w-3xl text-3xl text-balance md:text-4xl">
          Salon locator dataset
        </h1>
        <p className="text-muted-foreground font-reading mt-3 max-w-2xl text-lg">
          A live, local index of{" "}
          <span className="tabular-nums">{facets.total.toLocaleString()}</span>{" "}
          nail salons and technicians. Filter by geography, brand, and source,
          then map and sort the provenance-tagged records.
        </p>
      </header>

      <div className="reveal reveal-2">
        <SalonsExplorer facets={facets} />
      </div>
    </div>
  );
}
