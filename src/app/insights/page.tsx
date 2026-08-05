import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { InsightsView } from "@/components/insights/insights-view";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const metadata: Metadata = {
  title: "Insights",
  description: "Local usage analytics — never leaves your machine.",
};

export default function InsightsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Insights</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="mb-8">
        <h1 className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight md:text-4xl">
          <BarChart3 className="text-chart-1 h-8 w-8" />
          Insights
        </h1>
        <p className="text-muted-foreground mt-3 text-lg">
          Local usage — never leaves your machine.
        </p>
      </header>

      <InsightsView />
    </div>
  );
}
