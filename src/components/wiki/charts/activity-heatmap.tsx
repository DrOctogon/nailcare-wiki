"use client";

import { useMemo } from "react";

import type { ActivityDay } from "@/lib/wiki/vault";

interface ActivityHeatmapProps {
  data: ActivityDay[];
}

const DAY_MS = 86_400_000;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// Lacquer accent ramp: buckets 1–4 mix --primary into transparent at rising strength.
const BUCKET_MIX = [28, 48, 72, 100] as const;

interface Cell {
  /** UTC-midnight epoch ms for the day */
  time: number;
  count: number;
  /** 0 = empty ledger cell, 1–4 = activity intensity */
  bucket: number;
}

interface Column {
  /** First-of-month label to render above this week column, or null */
  monthLabel: string | null;
  cells: Cell[];
}

interface Grid {
  columns: Column[];
}

/** Parse a "YYYY-MM-DD" string as UTC-midnight epoch ms. */
function parseUtc(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

/** Snap an epoch-ms timestamp back to UTC midnight (defensive). */
function utcMidnight(time: number): number {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Bucket a nonzero count into 1–4 using roughly-quartile thresholds off the max. */
function bucketFor(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  // Quartile breakpoints on [1, max]. Any count ≥1 lands in bucket ≥1.
  const q = (max - 1) / 4;
  if (count <= 1 + q) return 1;
  if (count <= 1 + q * 2) return 2;
  if (count <= 1 + q * 3) return 3;
  return 4;
}

function backgroundForBucket(bucket: number): string {
  if (bucket === 0) return "var(--muted)";
  const mix = BUCKET_MIX[bucket - 1];
  return `color-mix(in oklch, var(--primary) ${mix}%, transparent)`;
}

function labelFor(count: number, time: number): string {
  const d = new Date(time);
  const weekday = WEEKDAY_LABELS[d.getUTCDay()];
  const month = MONTH_LABELS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const when = `${weekday}, ${month} ${day}, ${year}`;
  if (count > 0) {
    const noun = count === 1 ? "note" : "notes";
    return `${count} ${noun} · ${when}`;
  }
  return `No activity · ${when}`;
}

function buildGrid(data: ActivityDay[]): Grid {
  // Fold sparse data into a lookup, keyed by UTC-midnight epoch ms.
  const counts = new Map<number, number>();
  let max = 0;
  for (const day of data) {
    const time = parseUtc(day.date);
    if (Number.isNaN(time)) continue;
    const key = utcMidnight(time);
    const next = (counts.get(key) ?? 0) + day.count;
    counts.set(key, next);
    if (next > max) max = next;
  }

  const first = parseUtc(data[0].date);
  const last = parseUtc(data[data.length - 1].date);
  const firstMid = utcMidnight(first);
  const lastMid = utcMidnight(last);

  // Snap start back to the Sunday on/before the first active date,
  // and end forward to the Saturday on/after the last active date.
  const start = firstMid - new Date(firstMid).getUTCDay() * DAY_MS;
  const end = lastMid + (6 - new Date(lastMid).getUTCDay()) * DAY_MS;

  const columns: Column[] = [];
  let column: Cell[] = [];
  let seenMonthColumn = -1;

  for (let time = start; time <= end; time += DAY_MS) {
    const count = counts.get(time) ?? 0;
    column.push({ time, count, bucket: bucketFor(count, max) });

    const isSaturday = new Date(time).getUTCDay() === 6;
    if (isSaturday) {
      // Month label aligns above the first week column that contains a new month.
      const columnMonth = new Date(column[0].time).getUTCMonth();
      let monthLabel: string | null = null;
      if (columnMonth !== seenMonthColumn) {
        monthLabel = MONTH_LABELS[columnMonth];
        seenMonthColumn = columnMonth;
      }
      columns.push({ monthLabel, cells: column });
      column = [];
    }
  }

  // Flush any trailing partial column (end-snap guarantees full weeks, but be safe).
  if (column.length > 0) {
    const columnMonth = new Date(column[0].time).getUTCMonth();
    const monthLabel =
      columnMonth !== seenMonthColumn ? MONTH_LABELS[columnMonth] : null;
    columns.push({ monthLabel, cells: column });
  }

  return { columns };
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const grid = useMemo(() => (data.length > 0 ? buildGrid(data) : null), [data]);

  if (!grid) return null;

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="w-full">
      <div
        className="overflow-x-auto pb-1"
        role="img"
        aria-label={`Note activity heatmap by day. ${total} notes across ${grid.columns.length} weeks.`}
      >
        <div className="flex w-max gap-2">
          {/* Weekday labels: Mon / Wed / Fri only, aligned to rows 1/3/5. */}
          <div
            className="catalog-meta grid shrink-0 pt-[18px]"
            style={{ gridTemplateRows: "repeat(7, 12px)", rowGap: 3 }}
            aria-hidden="true"
          >
            {WEEKDAY_LABELS.map((label, row) => (
              <div
                key={label}
                className="flex items-center pr-1 text-[9px] leading-none"
                style={{ height: 12 }}
              >
                {row === 1 || row === 3 || row === 5 ? label : ""}
              </div>
            ))}
          </div>

          {/* Grid: month labels row above 7-row week columns. */}
          <div className="flex flex-col gap-1">
            {/* Month labels aligned above their starting week column. */}
            <div className="flex gap-[3px]" aria-hidden="true">
              {grid.columns.map((column, i) => (
                <div
                  key={`m-${i}`}
                  className="catalog-meta text-[9px] leading-none"
                  style={{ width: 12, height: 12 }}
                >
                  {column.monthLabel && (
                    <span className="whitespace-nowrap">{column.monthLabel}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Week columns. */}
            <div className="flex gap-[3px]">
              {grid.columns.map((column, i) => (
                <div key={`w-${i}`} className="flex flex-col gap-[3px]">
                  {column.cells.map((cell) => {
                    const label = labelFor(cell.count, cell.time);
                    return (
                      <div
                        key={cell.time}
                        title={label}
                        className="rounded-[2px]"
                        style={{
                          width: 12,
                          height: 12,
                          backgroundColor: backgroundForBucket(cell.bucket),
                          boxShadow:
                            cell.bucket === 0
                              ? "inset 0 0 0 1px var(--border)"
                              : undefined,
                          transition: "background-color 0.2s ease",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend, bottom-right. */}
      <div className="catalog-meta mt-2 flex items-center justify-end gap-1.5 text-[9px]">
        <span>Less</span>
        <div className="flex items-center gap-[3px]">
          {[0, 1, 2, 3, 4].map((bucket) => (
            <div
              key={bucket}
              className="rounded-[2px]"
              style={{
                width: 12,
                height: 12,
                backgroundColor: backgroundForBucket(bucket),
                boxShadow:
                  bucket === 0 ? "inset 0 0 0 1px var(--border)" : undefined,
              }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
