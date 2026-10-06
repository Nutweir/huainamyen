import { expect, test } from "@playwright/test";

test.describe("public journal", () => {
  test("old front-page links land on the journal at the same spot", async ({ page }) => {
    await page.goto("./#day-02");
    await expect(page).toHaveURL(/\/journeys\/huai-nam-yen#day-02$/);
    await expect(page.locator("#day-02")).toBeInViewport();
  });

  test("old travel-note anchors still work", async ({ page }) => {
    await page.goto("./?trip=huai-nam-yen#omkoi");
    await expect(page.locator("#getting-there")).toBeInViewport();
  });

  test("the whole journal is there: 2 days, 17 moments, photos load, clips present", async ({ page }) => {
    await page.goto("journeys/huai-nam-yen");
    await expect(page.locator("h1")).toHaveText("Huai Nam Yen");
    await expect(page.locator(".event")).toHaveCount(17);
    await expect(page.locator("video")).toHaveCount(3);
    await expect(page.getByText("นี่มัน... ทางช้างเผือกนี่หว่า")).toBeVisible();
    const broken = await page.evaluate(async () => {
      const imgs = [...document.images].slice(0, 12);
      await Promise.all(imgs.map(i => (i.loading = "eager", i.decode().catch(() => undefined))));
      return imgs.filter(i => !i.naturalWidth).map(i => i.src);
    });
    expect(broken).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("placeholders stay hidden unless ?slots", async ({ page }) => {
    await page.goto("journeys/huai-nam-yen");
    const hidden = await page.locator(".ph--slot, .slot").count();
    await page.goto("journeys/huai-nam-yen?slots");
    await page.locator(".event").first().waitFor();
    expect(await page.locator(".ph--slot, .slot").count()).toBeGreaterThanOrEqual(hidden);
    expect(hidden).toBe(0);
  });

  test("journeys list and unknown pages", async ({ page }) => {
    await page.goto("journeys");
    await expect(page.getByRole("link", { name: /Huai Nam Yen/ }).first()).toBeVisible();
    await page.goto("journeys/no-such-trip");
    await expect(page.getByText("ไม่พบบันทึกนี้")).toBeVisible();
  });
});
