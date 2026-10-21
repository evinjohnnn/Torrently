import { test, expect } from "@playwright/test";
test("real magnet to browser decoding, seek, download and library reload", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_MAGNET || !process.env.WEBTOR_API_KEY,
    "Requires own running Webtor and lawful TEST_MAGNET; no mock fallback.",
  );
  test.setTimeout(240000);
  await page.goto("/");
  await page.getByLabel("Email address").fill(process.env.ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Magnet link").fill(process.env.TEST_MAGNET!);
  await page
    .getByRole("button", { name: "Open torrent", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Save to library" }),
  ).toBeVisible({ timeout: 150000 });
  await page.getByRole("button", { name: "Save to library" }).click();
  await page
    .getByLabel("Search torrent files")
    .fill(process.env.TEST_VIDEO_NAME ?? ".mp4");
  await page
    .getByRole("button", { name: /^Play / })
    .first()
    .click();
  const video = page.locator("video");
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 60000,
    })
    .toBeGreaterThan(1);
  const target = await video.evaluate((v: HTMLVideoElement) => {
    const t = Math.min(5, v.duration / 2);
    v.currentTime = t;
    return t;
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 30000,
    })
    .toBeGreaterThan(target - 0.5);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /^Download / })
    .first()
    .click();
  const download = await downloadEvent;
  await download.saveAs(test.info().outputPath(download.suggestedFilename()));
  expect(await download.failure()).toBeNull();
  await page.getByRole("button", { name: "Close player" }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator(".library-row")).not.toHaveCount(0);
});
