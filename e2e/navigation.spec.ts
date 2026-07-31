import { test, expect } from "@playwright/test";

test.describe("navigation", () => {
  test("dashboard loads with brand and stat cards", async ({ page }) => {
    await page.goto("/");

    // Sidebar brand / heading.
    await expect(page.getByText("Vault Explorer").first()).toBeVisible();

    // Hero heading always renders regardless of vault contents.
    await expect(
      page.getByRole("heading", { name: /living web of research/i }),
    ).toBeVisible();

    // At least one stat card renders. Scope to an exact match — the wiki
    // index page card excerpt also contains the words "Total pages".
    await expect(page.getByText("Total pages", { exact: true })).toBeVisible();
  });

  test("sidebar navigates to graph, timeline and tags", async ({ page }) => {
    await page.goto("/");

    // Exact match: the hero also has an "Open the knowledge graph" link, so a
    // substring match on "Knowledge Graph" is ambiguous. The sidebar labels are
    // exact ("Knowledge Graph", "Timeline", "Tags").
    await page.getByRole("link", { name: "Knowledge Graph", exact: true }).click();
    await expect(page).toHaveURL(/\/graph$/);

    await page.getByRole("link", { name: "Timeline", exact: true }).click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(
      page.getByRole("heading", { name: "Timeline" }),
    ).toBeVisible();
    // Each month is a bucket in the timeline's ordered list.
    await expect(page.locator("ol > li").first()).toBeVisible();

    await page.getByRole("link", { name: "Tags", exact: true }).click();
    await expect(page).toHaveURL(/\/tags$/);
    await expect(
      page.getByRole("heading", { name: "Every tag in the vault" }),
    ).toBeVisible();
  });

  test("a wiki page renders an article with title and body", async ({
    page,
  }) => {
    await page.goto("/browse/concepts");

    // Click through to the first note in this collection.
    const firstWikiLink = page.locator('a[href^="/wiki/"]').first();
    await expect(firstWikiLink).toBeVisible();
    await firstWikiLink.click();

    await expect(page).toHaveURL(/\/wiki\/.+/);
    // The article renders an <h1> title and the prose body.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("article.wiki-prose")).toBeVisible();
  });
});
