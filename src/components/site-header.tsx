import { getSearchIndex } from "@/lib/wiki/vault";
import { SearchCommand } from "@/components/search-command";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export async function SiteHeader() {
  const docs = await getSearchIndex();

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <div className="flex-1" />
      <SearchCommand docs={docs} />
      <ModeToggle />
    </header>
  );
}
