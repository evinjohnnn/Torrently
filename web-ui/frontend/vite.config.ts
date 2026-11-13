import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { localeChunks } from "./locale-chunks.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

// The React app is built next to the webpack bundles and served from
// /assets/app/. Go reads .vite/manifest.json to find the hashed entry, so the
// page never references a file name directly (services/spa/spa.go).
export default defineConfig({
  root,
  base: "/assets/app/",
  plugins: [react(), localeChunks(fileURLToPath(new URL("../locales", import.meta.url)))],
  build: {
    outDir: fileURLToPath(new URL("../assets/dist/app", import.meta.url)),
    emptyOutDir: true,
    manifest: true,
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: fileURLToPath(new URL("./src/main.tsx", import.meta.url)),
    },
  },
});
