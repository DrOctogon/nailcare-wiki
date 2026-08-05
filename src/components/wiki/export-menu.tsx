"use client";

import { Copy, Download, FileDown, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportMenuProps {
  slug: string;
  title: string;
}

/**
 * Per-note export actions: download the raw Markdown, print (or "Save as PDF"
 * via the browser dialog), or copy the page link. Marked `.no-print` so it
 * disappears from the printed / PDF output.
 */
export function ExportMenu({ slug, title }: ExportMenuProps) {
  const handlePrint = (): void => {
    window.print();
  };

  const handleCopyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied", { description: title });
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="no-print">
            <Download data-icon="inline-start" />
            Export
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem
          render={
            <a href={`/api/raw/${slug}`} download={`${slug}.md`}>
              <FileDown />
              Download Markdown
            </a>
          }
        />
        <DropdownMenuItem onClick={handlePrint}>
          <Printer />
          Print / Save as PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyLink}>
          <Copy />
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
