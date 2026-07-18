"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Network, Tags, Sparkles, Library } from "lucide-react";

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

export function AppSidebar({ collections, totalPages }: AppSidebarProps) {
  const pathname = usePathname();

  const primary = [
    { href: "/", label: "Dashboard", icon: Home },
    { href: "/graph", label: "Knowledge Graph", icon: Network },
    { href: "/tags", label: "Tags", icon: Tags },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2.5 px-2 py-1.5 font-semibold"
        >
          <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm">Vault Explorer</span>
            <span className="text-muted-foreground text-[11px] font-normal">
              {totalPages} pages
            </span>
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
          <SidebarGroupLabel>
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
                    render={<Link href={href} />}
                  >
                    <span>{dirMeta(dir).label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{count}</SidebarMenuBadge>
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
