"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Globe,
  MapPinned,
  RotateCcw,
  Search,
  Star,
  TriangleAlert,
  Users,
} from "lucide-react";

import type { Facet, Salon, SalonFacets } from "@/lib/scrape/salons";
import { SalonMap } from "@/components/scrape/salon-map";
import { StatCard } from "@/components/wiki/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const COLUMN_COUNT = 7;

type SortKey = "name" | "rating" | "reviewCount" | "confidence";
type SortDir = "asc" | "desc";

interface SalonsResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: Salon[];
}

interface GeoResponse {
  count: number;
  points: [number, number][];
}

interface SalonsExplorerProps {
  facets: SalonFacets;
}

/** Debounce any changing value by `delay` ms. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Render a confidence score as a percentage when it reads like a 0–1 fraction. */
function formatConfidence(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value <= 1) return `${Math.round(value * 100)}%`;
  return value.toLocaleString();
}

function locationLine(salon: Salon): string {
  return [salon.city, salon.state, salon.country]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function SalonsExplorer({ facets }: SalonsExplorerProps) {
  // Search is debounced; selects/toggles/sort/page apply immediately.
  const [qInput, setQInput] = React.useState("");
  const debouncedQ = useDebounced(qInput, 300);

  const [country, setCountry] = React.useState("");
  const [state, setState] = React.useState("");
  const [source, setSource] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [entityType, setEntityType] = React.useState("");
  const [hasRating, setHasRating] = React.useState(false);
  const [hasGeo, setHasGeo] = React.useState(false);

  const [sort, setSort] = React.useState<SortKey>("confidence");
  const [dir, setDir] = React.useState<SortDir>("desc");
  const [page, setPage] = React.useState(1);

  // Bump to force a refetch (used by the error-state retry).
  const [reloadKey, setReloadKey] = React.useState(0);

  const [result, setResult] = React.useState<SalonsResponse | null>(null);
  const [tableLoading, setTableLoading] = React.useState(true);
  const [tableError, setTableError] = React.useState<string | null>(null);

  const [geo, setGeo] = React.useState<GeoResponse | null>(null);
  const [geoLoading, setGeoLoading] = React.useState(true);

  const hasActiveFilters =
    debouncedQ.trim() !== "" ||
    country !== "" ||
    state !== "" ||
    source !== "" ||
    brand !== "" ||
    entityType !== "" ||
    hasRating ||
    hasGeo;

  // The effects below set a loading flag synchronously before their async fetch
  // (and reset the page when filters change) — the intended pattern; eslint's
  // set-state-in-effect is a false positive for pre-fetch loading state here.
  /* eslint-disable react-hooks/set-state-in-effect */
  // Any filter change resets to the first page.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedQ, country, state, source, brand, entityType, hasRating, hasGeo]);

  /** Shared filter params. Paging/sort are opt-in (the map ignores them). */
  const filterParams = React.useCallback(
    (includePaging: boolean): string => {
      const p = new URLSearchParams();
      const trimmed = debouncedQ.trim();
      if (trimmed) p.set("q", trimmed);
      if (country) p.set("country", country);
      if (state) p.set("state", state);
      if (source) p.set("source", source);
      if (brand) p.set("brand", brand);
      if (entityType) p.set("entityType", entityType);
      if (hasRating) p.set("hasRating", "1");
      if (hasGeo) p.set("hasGeo", "1");
      if (includePaging) {
        p.set("sort", sort);
        p.set("dir", dir);
        p.set("page", String(page));
        p.set("pageSize", String(PAGE_SIZE));
      }
      return p.toString();
    },
    [debouncedQ, country, state, source, brand, entityType, hasRating, hasGeo, sort, dir, page],
  );

  // Table results — refetch on any filter, sort, or page change.
  React.useEffect(() => {
    const controller = new AbortController();
    setTableLoading(true);
    setTableError(null);

    fetch(`/api/salons?${filterParams(true)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<SalonsResponse>;
      })
      .then((data) => {
        setResult(data);
        setTableLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTableError(
          error instanceof Error ? error.message : "Unable to load salons.",
        );
        setTableLoading(false);
      });

    return () => controller.abort();
  }, [filterParams, reloadKey]);

  // Map points — refetch on filter change only (no paging/sort).
  React.useEffect(() => {
    const controller = new AbortController();
    setGeoLoading(true);

    fetch(`/api/salons/geo?${filterParams(false)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<GeoResponse>;
      })
      .then((data) => {
        setGeo(data);
        setGeoLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setGeo({ count: 0, points: [] });
        setGeoLoading(false);
      });

    return () => controller.abort();
    // Paging/sort deliberately excluded — the map reflects the full filtered set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedQ,
    country,
    state,
    source,
    brand,
    entityType,
    hasRating,
    hasGeo,
    reloadKey,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSort(key: SortKey) {
    if (key === sort) {
      setDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  function resetFilters() {
    setQInput("");
    setCountry("");
    setState("");
    setSource("");
    setBrand("");
    setEntityType("");
    setHasRating(false);
    setHasGeo(false);
    setPage(1);
  }

  const total = result?.total ?? 0;
  const rows = result?.rows ?? [];
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);
  const canPrev = page > 1;
  const canNext = page * PAGE_SIZE < total;

  const mapPoints = geo?.points ?? [];
  const mapCount = geo?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards — the first reflects the filtered result, the rest are dataset-level. */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total matches"
          value={(result?.total ?? facets.total).toLocaleString()}
          icon={Search}
          accent="var(--chart-1)"
          hint="matching filters"
        />
        <StatCard
          label="With location"
          value={(geo?.count ?? facets.withGeo).toLocaleString()}
          icon={MapPinned}
          accent="var(--chart-2)"
          hint="on the map"
        />
        <StatCard
          label="With rating"
          value={facets.withRating.toLocaleString()}
          icon={Star}
          accent="var(--chart-4)"
          hint="in dataset"
        />
        <StatCard
          label="Countries"
          value={facets.countries.length.toLocaleString()}
          icon={Users}
          accent="var(--chart-5)"
          hint="in dataset"
        />
      </section>

      {/* Map */}
      <Card className="overflow-hidden p-0">
        <SalonMap points={mapPoints} total={mapCount} loading={geoLoading} />
      </Card>

      {/* Filter toolbar */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-4">
          <div className="relative w-full sm:max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
            <Input
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Search name, city, brand…"
              aria-label="Search salons"
              className="h-9 pl-8"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <FacetSelect
              label="Country"
              value={country}
              onChange={setCountry}
              options={facets.countries}
            />
            <FacetSelect
              label="State"
              value={state}
              onChange={setState}
              options={facets.states}
            />
            <FacetSelect
              label="Source"
              value={source}
              onChange={setSource}
              options={facets.sources}
            />
            <FacetSelect
              label="Brand"
              value={brand}
              onChange={setBrand}
              options={facets.brands}
            />
            <FacetSelect
              label="Type"
              value={entityType}
              onChange={setEntityType}
              options={facets.entityTypes}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="catalog-meta mr-0.5 hidden sm:inline">Only</span>
            <Button
              type="button"
              size="sm"
              variant={hasRating ? "default" : "outline"}
              aria-pressed={hasRating}
              onClick={() => setHasRating((prev) => !prev)}
              className="h-9 px-3"
            >
              <Star className="h-3.5 w-3.5" /> Has rating
            </Button>
            <Button
              type="button"
              size="sm"
              variant={hasGeo ? "default" : "outline"}
              aria-pressed={hasGeo}
              onClick={() => setHasGeo((prev) => !prev)}
              className="h-9 px-3"
            >
              <MapPinned className="h-3.5 w-3.5" /> Has location
            </Button>
            {hasActiveFilters && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetFilters}
                className="ml-auto h-9 px-3"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Results table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-border border-b">
                <SortHeader
                  label="Name"
                  sortKey="name"
                  activeSort={sort}
                  activeDir={dir}
                  onSort={handleSort}
                  className="w-[30%]"
                />
                <th className="catalog-meta px-4 py-3 text-left font-normal">
                  Brands
                </th>
                <SortHeader
                  label="Rating"
                  sortKey="rating"
                  activeSort={sort}
                  activeDir={dir}
                  onSort={handleSort}
                  align="right"
                />
                <SortHeader
                  label="Reviews"
                  sortKey="reviewCount"
                  activeSort={sort}
                  activeDir={dir}
                  onSort={handleSort}
                  align="right"
                />
                <SortHeader
                  label="Conf."
                  sortKey="confidence"
                  activeSort={sort}
                  activeDir={dir}
                  onSort={handleSort}
                  align="right"
                />
                <th className="catalog-meta px-4 py-3 text-left font-normal">
                  Sources
                </th>
                <th className="catalog-meta px-4 py-3 text-right font-normal">
                  Links
                </th>
              </tr>
            </thead>
            <tbody>
              {tableError ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-4 py-16">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
                      <TriangleAlert className="text-muted-foreground h-6 w-6" />
                      <p className="text-sm">{tableError}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setReloadKey((key) => key + 1)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : tableLoading && rows.length === 0 ? (
                <SkeletonRows />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="px-4 py-16">
                    <div className="text-muted-foreground mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
                      <Search className="h-6 w-6" />
                      <p className="text-sm">
                        No salons match these filters.
                      </p>
                      {hasActiveFilters && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={resetFilters}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Reset filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((salon, index) => (
                  <SalonRow key={`${salon.name}-${index}`} salon={salon} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <p className="catalog-meta" aria-live="polite">
            {total === 0
              ? "No results"
              : `Showing ${showingFrom.toLocaleString()}–${showingTo.toLocaleString()} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canPrev || tableLoading}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="h-9"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canNext || tableLoading}
              onClick={() => setPage((prev) => prev + 1)}
              className="h-9"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

interface FacetSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Facet[];
}

function FacetSelect({ label, value, onChange, options }: FacetSelectProps) {
  const id = React.useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="catalog-meta">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "border-input h-9 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm",
          "transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3",
          "dark:bg-input/30",
        )}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value} ({option.count.toLocaleString()})
          </option>
        ))}
      </select>
    </div>
  );
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  activeDir,
  onSort,
  align = "left",
  className,
}: SortHeaderProps) {
  const active = activeSort === sortKey;
  const Icon = !active ? ChevronsUpDown : activeDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-4 py-3", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}${
          active ? ` (${activeDir === "asc" ? "ascending" : "descending"})` : ""
        }`}
        className={cn(
          "catalog-meta focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2",
          active ? "text-foreground" : "hover:text-foreground",
          align === "right" ? "flex-row-reverse" : "flex-row",
        )}
      >
        {label}
        <Icon
          className={cn("h-3 w-3", active ? "text-primary" : "opacity-50")}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

function SalonRow({ salon }: { salon: Salon }) {
  const location = locationLine(salon);
  const extraBrands = salon.brands.length - 2;
  return (
    <tr className="border-border/60 hover:bg-muted/40 border-b transition-colors">
      <td className="px-4 py-3 align-top">
        <div className="font-medium leading-snug">{salon.name}</div>
        {location && <div className="catalog-meta mt-1">{location}</div>}
      </td>
      <td className="px-4 py-3 align-top">
        {salon.brands.length === 0 ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {salon.brands.slice(0, 2).map((brandName) => (
              <Badge key={brandName} variant="soft">
                {brandName}
              </Badge>
            ))}
            {extraBrands > 0 && (
              <span className="text-muted-foreground text-xs tabular-nums">
                +{extraBrands}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right align-top">
        {salon.rating === null ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1 tabular-nums">
            <Star className="text-primary/80 h-3.5 w-3.5 fill-current" />
            {salon.rating.toFixed(1)}
          </span>
        )}
      </td>
      <td className="text-muted-foreground px-4 py-3 text-right align-top tabular-nums">
        {salon.reviewCount === null ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          salon.reviewCount.toLocaleString()
        )}
      </td>
      <td className="px-4 py-3 text-right align-top tabular-nums">
        <span className="text-muted-foreground">
          {formatConfidence(salon.confidence)}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        {salon.sources.length === 0 ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <span className="catalog-meta">{salon.sources.join(" · ")}</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center justify-end gap-1">
          <LinkIcon href={salon.website} label={`${salon.name} website`} icon={Globe} />
          <LinkIcon
            href={salon.bookingUrl}
            label={`Book ${salon.name}`}
            icon={CalendarCheck}
          />
          <LinkIcon
            href={salon.instagram}
            label={`${salon.name} on Instagram`}
            icon={Camera}
          />
        </div>
      </td>
    </tr>
  );
}

interface LinkIconProps {
  href: string | null;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function LinkIcon({ href, label, icon: Icon }: LinkIconProps) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:border-border",
        "focus-visible:ring-ring/50 inline-flex h-9 w-9 items-center justify-center rounded-md",
        "border border-transparent transition-colors outline-none focus-visible:ring-2",
      )}
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <tr key={index} className="border-border/60 border-b">
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-40 motion-reduce:animate-none" />
            <Skeleton className="mt-2 h-3 w-24 motion-reduce:animate-none" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-5 w-20 motion-reduce:animate-none" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="ml-auto h-4 w-10 motion-reduce:animate-none" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="ml-auto h-4 w-12 motion-reduce:animate-none" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="ml-auto h-4 w-10 motion-reduce:animate-none" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="ml-auto h-4 w-16 motion-reduce:animate-none" />
          </td>
        </tr>
      ))}
    </>
  );
}
