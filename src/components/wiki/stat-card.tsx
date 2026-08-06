import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: string;
  hint?: string;
}

export function StatCard({ label, value, icon: Icon, accent, hint }: StatCardProps) {
  return (
    <Card
      className="flex-row items-center gap-4 p-5"
      style={
        accent
          ? { borderTopColor: `color-mix(in oklch, ${accent} 40%, var(--border))` }
          : undefined
      }
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: accent
            ? `color-mix(in oklch, ${accent} 14%, transparent)`
            : "var(--muted)",
          color: accent ?? "var(--muted-foreground)",
          boxShadow: accent
            ? `inset 0 0 0 1px color-mix(in oklch, ${accent} 22%, transparent)`
            : undefined,
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="font-display text-2xl tracking-tight tabular-nums">
          {value}
        </div>
        <div className="catalog-meta mt-0.5 truncate">{label}</div>
        {hint && <div className="text-muted-foreground/70 mt-1 text-xs">{hint}</div>}
      </div>
    </Card>
  );
}
