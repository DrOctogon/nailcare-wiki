import path from "node:path";

/**
 * Absolute path to the nail-salon scrape directory.
 *
 * Local-only, live read: by default we resolve the sibling `claude-obsidian`
 * checkout relative to the Next.js project root (mirroring how the wiki resolves
 * its vault). Override with NAIL_SCRAPE_PATH if the dataset lives elsewhere.
 */
export const NAIL_SCRAPE_DIR =
  process.env.NAIL_SCRAPE_PATH ??
  path.join(process.cwd(), "..", "claude-obsidian", "assets", "data", "scrape", "nail");

/** The parsed-once master dataset: a JSON array of ~49k salon/tech records. */
export const NAIL_MASTER_FILE = path.join(NAIL_SCRAPE_DIR, "nail_salons_master.json");
