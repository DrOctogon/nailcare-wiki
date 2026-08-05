"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NoteEditorProps {
  slug: string;
  title: string;
  initialContent: string;
  /** File mtime at load, used to detect an external edit before overwriting. */
  initialMtimeMs: number;
}

/** Shape of the /api/note PUT response (success | error). */
type SaveResponse =
  | { ok: true; backupPath: string; note?: string; mtimeMs: number | null }
  | { ok?: false; error: string; code?: string; currentMtimeMs?: number };

/**
 * In-browser Markdown editor for a single vault note. Writes flow through the
 * safe-write API (backup + atomic rename, never delete) and require an explicit
 * confirm. Unsaved edits are protected by a dirty flag + `beforeunload` guard,
 * and are never discarded on a failed save.
 */
export function NoteEditor({
  slug,
  title,
  initialContent,
  initialMtimeMs,
}: NoteEditorProps) {
  const { resolvedTheme } = useTheme();
  const [value, setValue] = useState<string>(initialContent);
  // Baseline the "dirty" comparison + Discard target against. Starts at the
  // initial content and advances to the just-saved content on success, which is
  // how the dirty flag clears without mutating props.
  const [baseline, setBaseline] = useState<string>(initialContent);
  // The on-disk mtime this buffer is based on; advances on each successful save.
  // Sent with every PUT so the server can reject a stale overwrite (409).
  const [baseMtimeMs, setBaseMtimeMs] = useState<number>(initialMtimeMs);
  const [mounted, setMounted] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const dirty = value !== baseline;

  // CodeMirror needs the DOM; render it only after mount. This also avoids an
  // SSR/hydration theme mismatch (resolvedTheme is undefined on the server).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const extensions = useMemo<Extension[]>(
    () => [markdown(), EditorView.lineWrapping],
    [],
  );

  const editorTheme: "light" | "dark" =
    resolvedTheme === "dark" ? "dark" : "light";

  const handleChange = useCallback((next: string): void => {
    setValue(next);
  }, []);

  const handleDiscard = useCallback((): void => {
    setValue(baseline);
  }, [baseline]);

  // A hoisted function declaration (not useCallback) so the 409 "Overwrite
  // anyway" toast action can re-invoke it via self-reference — event handlers
  // don't need referential stability here.
  async function handleConfirmSave(overwrite = false): Promise<void> {
    setSaving(true);
    try {
      const response = await fetch(`/api/note/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value, baseMtimeMs, overwrite }),
      });

      let data: SaveResponse;
      try {
        data = (await response.json()) as SaveResponse;
      } catch {
        data = { error: `Save failed (HTTP ${response.status}).` };
      }

      // 409: the file changed on disk since load. Offer to overwrite (a
      // backup is still kept) or bail so the user can reload the latest.
      if (response.status === 409) {
        const message =
          "error" in data && data.error
            ? data.error
            : "This note changed on disk since you opened it.";
        toast.warning("Note changed on disk", {
          description: message,
          action: {
            label: "Overwrite anyway",
            onClick: () => void handleConfirmSave(true),
          },
        });
        return;
      }

      if (!response.ok || !("ok" in data) || data.ok !== true) {
        const message =
          "error" in data && data.error
            ? data.error
            : `Save failed (HTTP ${response.status}).`;
        // Never lose the user's edits — keep editor state intact.
        toast.error("Couldn't save note", { description: message });
        return;
      }

      // Success: advance the content + mtime baselines (no longer dirty/stale).
      setBaseline(value);
      if (typeof data.mtimeMs === "number") setBaseMtimeMs(data.mtimeMs);
      setConfirmOpen(false);
      toast.success("Saved — backup kept", {
        description:
          "Changes appear after the page rebuilds or the dev server reloads.",
        action: {
          label: "View note",
          onClick: () => {
            window.location.href = `/wiki/${slug}`;
          },
        },
      });
    } catch (err) {
      toast.error("Couldn't save note", {
        description:
          err instanceof Error ? err.message : "Network error while saving.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/wiki/${slug}`} />}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to note
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDiscard}
            disabled={!dirty || saving}
          >
            <RotateCcw data-icon="inline-start" />
            Discard
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="overflow-hidden rounded-lg border bg-card">
        {mounted ? (
          <CodeMirror
            value={value}
            onChange={handleChange}
            extensions={extensions}
            theme={editorTheme}
            height="70vh"
            aria-label={`Markdown editor for ${title}`}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
            }}
          />
        ) : (
          <div
            className="text-muted-foreground flex items-center justify-center text-sm"
            style={{ height: "70vh" }}
          >
            Loading editor…
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Edits are written to your local Obsidian vault. Every save keeps a
        timestamped backup of the previous version and never deletes the
        original.
      </p>

      {/* Confirm-before-save dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes?</DialogTitle>
            <DialogDescription>
              Save changes to <span className="font-medium">{title}</span>? A
              backup of the current version will be kept, and the original is
              never deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => void handleConfirmSave()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
