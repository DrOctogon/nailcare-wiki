"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isBookmarked, subscribe, toggleBookmark } from "@/lib/bookmarks";

interface BookmarkButtonProps {
  slug: string;
  title: string;
  dir: string;
  type: string;
}

/**
 * Toggle a note in the reading queue. Renders a stable "not saved" state on the
 * server / first paint, then hydrates the real bookmarked status in an effect
 * to avoid an SSR/client mismatch. Stays in sync with the list view and other
 * tabs via the bookmarks subscription.
 */
export function BookmarkButton({ slug, title, dir, type }: BookmarkButtonProps) {
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    const sync = (): void => setSaved(isBookmarked(slug));
    sync();
    return subscribe(sync);
  }, [slug]);

  const handleClick = (): void => {
    const nowSaved = toggleBookmark({ slug, title, dir, type });
    setSaved(nowSaved);
    if (nowSaved) {
      toast.success("Saved to reading queue", { description: title });
    } else {
      toast("Removed from reading queue", { description: title });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? "Remove from reading queue" : "Save to reading queue"}
    >
      {saved ? (
        <BookmarkCheck data-icon="inline-start" />
      ) : (
        <Bookmark data-icon="inline-start" />
      )}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
