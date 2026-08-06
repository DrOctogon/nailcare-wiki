"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface TocHeading {
  id: string;
  text: string;
  depth: number;
}

interface TocProps {
  headings: TocHeading[];
}

export function Toc({ headings }: TocProps) {
  const items = React.useMemo(
    () => headings.filter((h) => h.depth >= 2 && h.depth <= 3),
    [headings],
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (items.length < 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    for (const { id } of items) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  const handleClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    if (history.replaceState) {
      history.replaceState(null, "", `#${id}`);
    }
  };

  return (
    <nav aria-label="Table of contents">
      <div className="catalog-meta mb-3">On this page</div>
      <ul className="space-y-1 text-sm">
        {items.map((heading) => {
          const isActive = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                onClick={(event) => handleClick(event, heading.id)}
                className={cn(
                  "hover:text-foreground block border-l-2 py-0.5 transition-colors",
                  heading.depth === 3 ? "pl-5" : "pl-3",
                  isActive
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
