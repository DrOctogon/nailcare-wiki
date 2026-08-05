import { test, expect } from "@playwright/test";

test.describe("search palette", () => {
  test("keyword search finds results and navigates to a wiki page", async ({
    page,
  }) => {
    await page.goto("/");

    // Open the ⌘K palette via the header search button (deterministic across
    // platforms; keyboard shortcut is also wired but clicking avoids OS flake).
    await page.getByRole("button", { name: "Search the vault" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Keyword mode is the default (deterministic — Hybrid needs an in-browser
    // model download, so we never assert on it).
    // Match by prefix so palette copy tweaks (e.g. "…tags, text…") don't break it.
    await page.getByPlaceholder(/^Search pages, tags/).fill("nail");

    // Results render as command options; "nail" is pervasive in this vault.
    const options = dialog.getByRole("option");
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThan(0);

    // Selecting a result navigates to its wiki page. The dynamic /wiki/[slug]
    // route compiles on-demand under `next dev`, so allow generous time for the
    // client-side router.push to land rather than a tight toHaveURL poll.
    await options.first().click();
    await page.waitForURL(/\/wiki\/.+/, { timeout: 20_000 });
  });
});
