import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { WIKI_DIR } from "./config";

/**
 * Result of a {@link safeWriteFile} call. A discriminated union: on success it
 * carries the path of the backup that was kept (empty string when the target
 * did not previously exist); on failure it carries a human-readable reason.
 */
export type SafeWriteResult =
  | { ok: true; backupPath: string }
  | { ok: false; error: string };

/**
 * Maximally-safe write into the Obsidian vault. This is the ONLY code path that
 * mutates a user's real notes, so it is defensive at every step:
 *
 *   1. Path guard — the resolved target must live inside {@link WIKI_DIR} and
 *      end in `.md`. Callers already pass server-derived paths (slug → vault
 *      file), but this is defense-in-depth against traversal.
 *   2. Backup — before touching the file, copy the current version to
 *      `<WIKI_DIR>/.backups/<relativePath>.<timestamp>.bak`. The vault walker
 *      skips dot-directories, so backups never pollute the wiki.
 *   3. Atomic write — write to a temp file in the SAME directory, then
 *      `fs.rename` it over the original (atomic on one filesystem). The original
 *      is NEVER unlinked; a failed write leaves it untouched.
 *
 * Never throws — every failure is returned as `{ ok: false, error }`.
 */
export async function safeWriteFile(
  filePath: string,
  content: string,
): Promise<SafeWriteResult> {
  try {
    // ---- 1. Path guard (defense-in-depth) --------------------------------
    const resolvedRoot = path.resolve(WIKI_DIR);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
      return {
        ok: false,
        error: "Refused: target path is outside the wiki vault.",
      };
    }
    if (!resolvedPath.endsWith(".md")) {
      return {
        ok: false,
        error: "Refused: only Markdown (.md) files may be written.",
      };
    }

    // ---- 2. Backup the current version (if any) --------------------------
    let backupPath = "";
    let exists = true;
    try {
      await fs.access(resolvedPath);
    } catch {
      exists = false;
    }

    if (exists) {
      const rel = path.relative(resolvedRoot, resolvedPath);
      // Date.now() is intentionally avoided (may be restricted in some
      // contexts); this runs in a Node route handler at request time, so
      // `new Date()` is available and reliable.
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = path.join(
        resolvedRoot,
        ".backups",
        `${rel}.${timestamp}.bak`,
      );
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.copyFile(resolvedPath, backupPath);
    }

    // ---- 3. Atomic write (temp file → rename over original) --------------
    const rand = randomBytes(6).toString("hex");
    const tmpPath = `${resolvedPath}.${rand}.tmp`;
    try {
      await fs.writeFile(tmpPath, content, "utf8");
      await fs.rename(tmpPath, resolvedPath);
    } catch (writeErr) {
      // Best-effort cleanup of the temp file only — never touch the original.
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Temp file may not exist; ignore.
      }
      return {
        ok: false,
        error:
          writeErr instanceof Error
            ? writeErr.message
            : "Failed to write the note file.",
      };
    }

    return { ok: true, backupPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unexpected write error.",
    };
  }
}
