import { test, expect } from "@playwright/test";
const email = process.env.ADMIN_EMAIL ?? "admin@localhost.test";
const password = process.env.ADMIN_PASSWORD ?? "test-only-browser-password";
async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make yourself at home." }),
  ).toBeVisible();
}
test("real login, validation, library navigation and logout", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("Magnet link").fill("invalid");
  await page
    .getByRole("button", { name: "Open torrent", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Paste a magnet link beginning with magnet:?."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("real backend reports unconfigured engine as an error, never fabricated files", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.WEBTOR_API_KEY),
    "This error-state test is only for an unconfigured development engine.",
  );
  await login(page);
  await page
    .getByLabel("Magnet link")
    .fill("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
  await page
    .getByRole("button", { name: "Open torrent", exact: true })
    .last()
    .click();
  await expect(
    page.getByText(/The torrent engine is not configured/),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
test("mobile workspace stays within viewport and settings shows real storage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByLabel("Magnet link")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
