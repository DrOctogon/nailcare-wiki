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
    <Card className="flex-row items-center gap-4 p-5">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: accent
            ? `color-mix(in oklch, ${accent} 16%, transparent)`
            : "var(--muted)",
          color: accent ?? "var(--muted-foreground)",
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <div className="text-muted-foreground truncate text-sm">{label}</div>
        {hint && <div className="text-muted-foreground/70 text-xs">{hint}</div>}
      </div>
    </Card>
  );
}
