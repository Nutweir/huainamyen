import { expect, test, type Page } from "@playwright/test";

/* Local test mode only: the login below is the documented local test login, not a real account. */
async function signIn(page: Page) {
  await page.goto("admin");
  await expect(page).toHaveURL(/admin\/login/);
  await page.getByLabel("อีเมล").fill("owner@local");
  await page.getByLabel("รหัสผ่าน").fill("local");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ภาพรวม" })).toBeVisible();
}

test("admin pages need a sign-in", async ({ page }) => {
  await page.goto("admin/trips");
  await expect(page).toHaveURL(/admin\/login\?next=/);
});

test("write a new trip: draft stays private until published, then readers see it", async ({ page, context }) => {
  page.on("dialog", d => d.accept());
  await signIn(page);

  // create
  await page.getByRole("button", { name: "+ เริ่มทริปใหม่" }).click();
  await page.getByLabel("ชื่อทริป").fill("ทดสอบ E2E");
  await page.getByLabel("ลิงก์ (slug)").fill("e2e-trip");
  await page.getByLabel("วันไป").fill("2027-02-01");
  await page.getByRole("button", { name: "สร้างเป็นฉบับร่าง" }).click();
  await expect(page).toHaveURL(/admin\/trips\/[0-9a-f-]+$/);

  // write a paragraph; autosave
  await page.getByRole("button", { name: /\+ เพิ่มเนื้อหา/ }).click();
  await page.getByRole("button", { name: "ย่อหน้า", exact: true }).click();
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially("ข้อความลับก่อนเผยแพร่");

  // the live preview beside the editor shows it as readers will see it, outlined, before any save
  const preview = page.frameLocator('iframe[title="ตัวอย่างหน้าบันทึก"]');
  const shown = preview.locator("[data-block]").filter({ hasText: "ข้อความลับก่อนเผยแพร่" });
  await expect(shown).toBeVisible();
  await expect(shown).toHaveCSS("outline-style", "dashed");

  await expect(page.getByRole("status").filter({ hasText: "บันทึกแล้ว" })).toBeVisible({ timeout: 10_000 });

  // readers can't see the draft
  const reader = await context.newPage();
  await reader.goto("journeys/e2e-trip");
  await expect(reader.getByText("ไม่พบบันทึกนี้")).toBeVisible();

  // preview shows it
  await reader.goto(page.url() + "/preview");
  await expect(reader.getByText("ข้อความลับก่อนเผยแพร่")).toBeVisible();

  // publish → readers see it
  await page.getByRole("button", { name: "เผยแพร่", exact: true }).click();
  await expect(page.getByText("เผยแพร่แล้ว").first()).toBeVisible();
  await reader.goto("journeys/e2e-trip");
  await expect(reader.getByText("ข้อความลับก่อนเผยแพร่")).toBeVisible();

  // unpublish → hidden again
  await page.getByRole("button", { name: "ยกเลิกเผยแพร่" }).click();
  await expect(page.locator(".chip").filter({ hasText: "ฉบับร่าง" })).toBeVisible();
  await reader.goto("journeys/e2e-trip");
  await expect(reader.getByText("ไม่พบบันทึกนี้")).toBeVisible();
});

test("rich text cannot inject markup", async ({ page }) => {
  page.on("dialog", d => d.accept());
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  await page.getByRole("button", { name: /\+ เพิ่มเนื้อหา/ }).click();
  await page.getByRole("button", { name: "ย่อหน้า", exact: true }).click();
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially('<img src=x onerror="window.__xss=1">');
  await expect(page.getByRole("status").filter({ hasText: "บันทึกแล้ว" })).toBeVisible({ timeout: 10_000 });
  await page.goto(page.url() + "/preview");
  await expect(page.getByText('<img src=x onerror="window.__xss=1">')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test("add a photo right where you are writing, and see it in the preview", async ({ page }) => {
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  await page.locator('section[aria-label="เนื้อหาของวัน"] li button[aria-pressed]').filter({ hasText: "ถ้าดูจากเวลาแล้ว" }).click();
  await page.getByRole("button", { name: /\+ รูปเล็กข้างข้อความ/ }).click();
  const picker = page.locator("dialog[open]");
  await picker.locator("ul button[aria-pressed]").first().click();
  await picker.getByRole("button", { name: "ใช้ที่เลือก" }).click();
  // the print sits beside that paragraph in the live preview, outlined as the current block
  const beside = page.frameLocator('iframe[title="ตัวอย่างหน้าบันทึก"]').locator(".beside").filter({ hasText: "ถ้าดูจากเวลาแล้ว" });
  await expect(beside).toBeVisible();
  await expect(beside.locator("[data-block]").first()).toHaveCSS("outline-style", "dashed");
});
