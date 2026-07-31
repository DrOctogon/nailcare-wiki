import { test, expect } from "@playwright/test";

const EXAMPLE_QUESTION = "What's the difference between gel and acrylic nails?";

test.describe("ask the vault", () => {
  test("renders the composer, examples and status region", async ({ page }) => {
    await page.goto("/ask");

    // Page heading (the breadcrumb "Ask the Vault" is not a heading).
    await expect(
      page.getByRole("heading", { name: "Ask the Vault" }),
    ).toBeVisible();

    // Composer textarea.
    const textarea = page.getByRole("textbox");
    await expect(textarea).toBeVisible();

    // Example-question chips (rendered while the conversation is empty).
    await expect(
      page.getByRole("button", { name: EXAMPLE_QUESTION }),
    ).toBeVisible();

    // Health / freshness status region always renders (regardless of Ollama).
    // Scope to the <div> so we don't collide with Next.js's route-announcer
    // <section aria-live="polite">.
    await expect(page.locator('div[aria-live="polite"]')).toBeVisible();

    // Model picker exists but we do NOT depend on it being populated.
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("Ask button is disabled until the textarea has content", async ({
    page,
  }) => {
    await page.goto("/ask");

    const askButton = page.getByRole("button", { name: "Ask" });
    await expect(askButton).toBeDisabled();

    await page.getByRole("textbox").fill("How should I price a service menu?");
    await expect(askButton).toBeEnabled();
  });

  test("streams a grounded answer when a local model is available", async ({
    page,
    request,
  }) => {
    // In-browser query embedding (HF-CDN weights) + local retrieval + token
    // streaming all run end-to-end here, so raise the per-test budget well past
    // the 90s visibility wait rather than letting the default 30s cap kill it.
    test.setTimeout(150_000);

    // Gate the LLM-dependent flow: only run when Ollama is serving our model.
    const res = await request.get("/api/ask");
    const health = (await res.json()) as {
      serving?: boolean;
      hasModel?: boolean;
    };
    test.skip(
      !(health.serving && health.hasModel),
      "Ollama is not serving a chat model — skipping the LLM streaming flow.",
    );

    await page.goto("/ask");

    // The composer's model picker is empty until the async health probe
    // resolves and seeds it. Submitting before that posts an empty model name
    // and the server rejects it (400 model_not_installed). Wait for the
    // "Local LLM ready" pill — it renders in the same state update that seeds
    // the model — so the POST carries a real model.
    await expect(page.getByText("Local LLM ready")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("textbox").fill(EXAMPLE_QUESTION);
    await page.getByRole("button", { name: "Ask" }).click();

    // Retrieval runs locally and returns sources before the answer streams;
    // the "Retrieved from N notes" region is the deterministic signal.
    await expect(page.getByText(/Retrieved from \d+ note/)).toBeVisible({
      timeout: 90_000,
    });
  });
});
