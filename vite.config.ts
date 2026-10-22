import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      // gallery.html is an isolated preview of the backdrop studies
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        gallery: resolve(import.meta.dirname, "gallery.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
