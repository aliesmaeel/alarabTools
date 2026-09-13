import { test, expect } from "@playwright/test";

/** Needs REDIS_URL, ADMIN_PASSWORD=local-admin-pass and AI_MOCK=1 on the web server (see .env.local). */
test.skip(!process.env.SERVER_TOOLS, "server pipeline not running");

test("admin: sign in, add a mock key, test it, reorder routing", async ({ page }) => {
  // Signed out, admin pages are a plain 404.
  const res = await page.goto("/admin/providers");
  expect(res?.status()).toBe(404);

  await page.goto("/admin");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong password.")).toBeVisible();
  await page.getByLabel("Password").fill("local-admin-pass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/providers/);
  await expect(page.getByRole("heading", { name: "AI providers" })).toBeVisible();

  const card = page.getByTestId("provider-mock");
  await card.getByRole("button", { name: /Add key|Replace key/ }).click();
  await page.getByRole("dialog").getByLabel("Any value").fill("mock-key-4321");
  await page.getByRole("button", { name: "Test and save" }).click();
  await expect(page.getByTestId("key-result")).toContainText("Mock provider ready");
  await expect(card.getByText("••••••••4321")).toBeVisible({ timeout: 10_000 });
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  // The key itself never appears in the page once the dialog has closed.
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  await page.reload();
  await expect(card.getByText("••••••••4321")).toBeVisible();
  expect(await page.content()).not.toContain("mock-key-4321");

  await page.getByRole("link", { name: "Routing" }).click();
  await expect(page.getByRole("heading", { name: "Routing" })).toBeVisible();
  const list = page.getByRole("list", { name: "translate order" });
  const first = await list.getByRole("listitem").first().innerText();
  await list.getByRole("listitem").first().getByRole("button", { name: /move .* down/ }).click();
  await page.getByTestId("save-routing").click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  const after = await page.getByRole("list", { name: "translate order" }).getByRole("listitem").nth(1).innerText();
  expect(after.split("\n")[1]).toBe(first.split("\n")[1]);
  // Gemini stays last whatever happens.
  const items = await page.getByRole("list", { name: "translate order" }).getByRole("listitem").allInnerTexts();
  expect(items[items.length - 1]).toContain("Gemini");

  await page.getByRole("link", { name: "Jobs and audit log" }).click();
  await expect(page.getByText("provider.test").first()).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
