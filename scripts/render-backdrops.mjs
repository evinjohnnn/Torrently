// Renders the static fallback stills for the lenticular backdrops.
// Run `npm run backdrops:render` after changing a scene; it builds the
// client, serves it locally and exports each concept through the same
// WebGL renderer the gallery uses.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const out = "client/backdrops/fallbacks";
const [width, height] = [1600, 1000];

const server = await preview({ preview: { port: 4174, strictPort: true } });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  // software GL so stills render identically on machines without a GPU
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:4174/gallery.html");
  await page.waitForFunction(
    () => typeof window.__exportBackdrop === "function",
  );
  await mkdir(out, { recursive: true });
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll(".card")].map(
      (a) => a.getAttribute("href").slice(1).split("/")[0],
    ),
  );
  for (const id of ids) {
    const data = await page.evaluate(
      async ([id, width, height]) => {
        const concept = window.__getConcept(id);
        const blob = await window.__exportBackdrop(
          id,
          concept.defaults,
          width,
          height,
          "image/webp",
        );
        return [...new Uint8Array(await blob.arrayBuffer())];
      },
      [id, width, height],
    );
    await writeFile(`${out}/${id}.webp`, Buffer.from(data));
    console.log(`${id}.webp  ${(data.length / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
