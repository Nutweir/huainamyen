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
  // the check runs first; a new trip has no cover yet, which is a warning, not a blocker
  const check = page.locator("dialog[open]");
  await expect(check).toContainText("ยังไม่มีรูปปก");
  await check.getByRole("button", { name: /^เผยแพร่/ }).click();
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

test("drag blocks with the mouse to reorder them, or onto another day", async ({ page }) => {
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  const rows = page.locator("[data-row]");
  await expect(rows.nth(3)).toContainText("ถ้าดูจากเวลาแล้ว");
  const from = (await rows.nth(3).boundingBox())!, to = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(from.x + 80, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, to.y + 4, { steps: 8 });
  await expect(page.locator("ol .bg-forest.h-1")).toBeVisible(); // the drop line
  await page.mouse.up();
  await expect(rows.nth(1)).toContainText("ถ้าดูจากเวลาแล้ว");
  await expect(rows.nth(2)).toContainText("เช้าวันนั้น");

  // onto the Day 02 button: moves to the end of that day
  const day2 = page.locator('[data-day-drop="1"]');
  const before = Number((await day2.innerText()).match(/(\d+) ส่วน/)![1]);
  const src = (await rows.nth(1).boundingBox())!, target = (await day2.boundingBox())!;
  await page.mouse.move(src.x + 80, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(day2).toContainText(`${before + 1} ส่วน`);
  await expect(page.locator("[data-row]").last()).toContainText("ถ้าดูจากเวลาแล้ว");
});

test("click in the live preview to edit that spot; undo with Ctrl+Z", async ({ page }) => {
  page.on("dialog", d => d.accept());
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  const preview = page.frameLocator('iframe[title="ตัวอย่างหน้าบันทึก"]');
  await preview.locator("[data-block]").filter({ hasText: "ระหว่างทางบรรยากาศดี" }).first().click();
  await expect(page.locator('[data-row] button[aria-pressed="true"]')).toContainText("ระหว่างทางบรรยากาศดี");

  const rows = page.locator("[data-row]");
  const third = await rows.nth(2).innerText();
  await rows.nth(2).getByRole("button", { name: /^ลบ/ }).click();
  await expect.poll(() => rows.nth(2).innerText()).not.toBe(third);
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("Control+z");
  await expect.poll(() => rows.nth(2).innerText()).toBe(third);
  await page.keyboard.press("Control+y");
  await expect.poll(() => rows.nth(2).innerText()).not.toBe(third);
  await page.getByRole("button", { name: "ย้อนกลับ" }).click();
  await expect.poll(() => rows.nth(2).innerText()).toBe(third);
});

test("publishing is held back while something is broken, and the list takes you there", async ({ page }) => {
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  await page.getByRole("button", { name: /\+ เพิ่มเนื้อหา/ }).click();
  await page.getByRole("button", { name: "รูป", exact: true }).click();
  await page.getByRole("button", { name: "เผยแพร่ฉบับนี้" }).click();
  const check = page.locator("dialog[open]");
  await expect(check).toContainText("ต้องแก้ก่อนเผยแพร่");
  await expect(check.getByRole("button", { name: /^เผยแพร่/ })).toBeDisabled();
  await check.getByRole("button", { name: /ยังไม่ได้เลือกรูป/ }).click();
  await expect(check).toBeHidden();
  await expect(page.locator('[data-row] button[aria-pressed="true"]')).toContainText("ยังไม่เลือกรูป");
});

test("drop a photo file from the computer between two paragraphs", async ({ page }) => {
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  const rows = page.locator("[data-row]");
  await expect(rows.nth(3)).toBeVisible();
  const [above, below] = [await rows.nth(2).innerText(), await rows.nth(3).innerText()];
  // a real image file, dropped just above the 4th row
  await rows.nth(3).evaluate(async el => {
    const blob = await (await fetch("/huainamyen/trips/huai-nam-yen/day-02/waterfall.jpg")).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "from-computer.jpg", { type: "image/jpeg" }));
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: r.left + 80, clientY: r.top + 3, dataTransfer: dt }));
  });
  await expect(page.locator(".fixed.bottom-4")).toContainText("เพิ่ม 1 ไฟล์แล้ว", { timeout: 15_000 });
  await expect.poll(() => rows.nth(2).innerText()).toBe(above);
  await expect(rows.nth(3)).toContainText("รูป");
  await expect.poll(() => rows.nth(4).innerText()).toBe(below);
});

test("trip details tab: the preview sits beside the form and shows the share card", async ({ page }) => {
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  await page.getByRole("tab", { name: /ข้อมูลทริป/ }).click();
  const frame = page.locator('iframe[title="ตัวอย่างหน้าบันทึก"]');
  await expect(frame).toBeVisible();
  await expect(page.locator(".fixed").filter({ has: frame })).toHaveCount(0); // docked, not a floating panel
  await expect(page.getByLabel("ตัวอย่างการ์ดตอนแชร์")).toContainText("Huai Nam Yen");
  await page.locator('[data-preview="#ending"] input').first().click();
  await expect(page.frameLocator('iframe[title="ตัวอย่างหน้าบันทึก"]').locator("#ending")).toBeInViewport();
});

test("see what changed since publishing, and the library says where a photo is used", async ({ page }) => {
  page.on("dialog", d => d.accept());
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  await page.locator("[data-row]").nth(2).getByRole("button", { name: /^ลบ/ }).click();
  await page.getByRole("button", { name: "เทียบกับที่เผยแพร่" }).click();
  await expect(page.locator("dialog[open]")).toContainText("ลบย่อหน้า");
  await page.locator("dialog[open]").getByRole("button", { name: "ปิด" }).click();

  await page.goto("admin/media");
  await page.locator("main ul li button").filter({ has: page.locator('img[alt*="น้องแพะ"]') }).first().click();
  const used = page.locator("aside").getByRole("link", { name: /Huai Nam Yen · Day 02/ });
  await expect(used).toBeVisible();
  await used.click();
  const row = page.locator('[data-row] button[aria-pressed="true"]');
  await expect(row).toContainText("ชุดรูป");
  await expect(row).toBeInViewport();
});

test("clicking the cover photo, title or a travel note in the preview takes you to that field", async ({ page }) => {
  await signIn(page);
  await page.goto("admin/trips");
  await page.getByRole("link", { name: "แก้ไข" }).first().click();
  await page.getByRole("tab", { name: /ข้อมูลทริป/ }).click();
  const preview = page.frameLocator('iframe[title="ตัวอย่างหน้าบันทึก"]');

  await preview.locator(".cover-photo img").click();
  const cover = page.locator('[data-field="cover"]');
  await expect(cover).toHaveClass(/field-flash/);
  await expect(cover).toBeInViewport();

  await preview.locator(".cover-meta").click();
  await expect(page.locator('[data-field="coverMeta"] textarea')).toBeFocused();

  await preview.locator("#notes .note-sec").first().click();
  await expect(page.getByRole("tab", { name: "ข้อมูลการเดินทาง" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('details[data-field^="notes:"][open]').first()).toBeInViewport();
});
