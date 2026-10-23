import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const page = (name: string) => resolve(import.meta.dirname, `${name}.html`);

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // `--mode preview` builds only the self-contained previews (the app on
  // sample data, and the Natively notepad hero), with relative paths so they
  // can be hosted anywhere. They are never part of the production build.
  base: mode === "preview" ? "./" : "/",
  build: {
    outDir: mode === "preview" ? "dist/preview" : "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input:
        mode === "preview"
          ? { preview: page("preview"), notepad: page("notepad") }
          : {
              main: page("index"),
              // gallery.html is an isolated preview of the backdrop studies
              gallery: page("gallery"),
            },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
}));
