"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Network,
  Tags,
  Library,
  CalendarClock,
  MessageCircleQuestion,
  BarChart3,
  BookmarkCheck,
  Newspaper,
  Database,
} from "lucide-react";

import { dirMeta } from "@/lib/wiki/labels";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarRail,
} from "@/components/ui/sidebar";

export interface CollectionNav {
  dir: string;
  count: number;
}

interface AppSidebarProps {
  collections: CollectionNav[];
  totalPages: number;
}

// Lacquer active signal: a faint primary-tinted pill plus a flush-left oxblood
// accent bar — the ledger index tab that marks the current page. Passed to both
// nav groups so the whole sidebar reads consistently.
const navButtonClass =
  "relative data-active:bg-primary/10 data-active:font-medium " +
  "before:pointer-events-none before:absolute before:top-1.5 before:bottom-1.5 " +
  "before:left-0 before:w-[3px] before:rounded-full before:bg-primary " +
  "before:opacity-0 before:transition-opacity data-active:before:opacity-100";

export function AppSidebar({ collections, totalPages }: AppSidebarProps) {
  const pathname = usePathname();

  const primary = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/ask", label: "Ask the Vault", icon: MessageCircleQuestion },
    { href: "/graph", label: "Knowledge Graph", icon: Network },
    { href: "/timeline", label: "Timeline", icon: CalendarClock },
    { href: "/digest", label: "Digest", icon: Newspaper },
    { href: "/tags", label: "Tags", icon: Tags },
    { href: "/bookmarks", label: "Reading Queue", icon: BookmarkCheck },
    { href: "/insights", label: "Insights", icon: BarChart3 },
    { href: "/data", label: "Salon Data", icon: Database },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
        >
          {/* Bespoke archive mark — a lacquered tile with a Fraunces monogram,
              inner hairline for the enamelled edge. Tokens only. */}
          <span className="bg-primary text-primary-foreground ring-primary-foreground/15 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset">
            <span className="font-display text-base leading-none">V</span>
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-display truncate text-sm leading-tight">
              Vault Explorer
            </span>
            <span className="catalog-meta tabular-nums">{totalPages} pages</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {primary.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={active}
                    className={navButtonClass}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="catalog-meta">
            <Library className="mr-1.5 h-3.5 w-3.5" /> Collections
          </SidebarGroupLabel>
          <SidebarMenu>
            {collections.map(({ dir, count }) => {
              const href = `/browse/${dir}`;
              const active = pathname === href;
              return (
                <SidebarMenuItem key={dir}>
                  <SidebarMenuButton
                    isActive={active}
                    className={navButtonClass}
                    render={<Link href={href} />}
                  >
                    <span>{dirMeta(dir).label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="font-mono text-[0.7rem] tabular-nums">
                    {count}
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
