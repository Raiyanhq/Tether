import { defineConfig } from "vite";
import { resolve } from "path";

// Pass 2: content script as a single self-contained IIFE (content scripts can't be ES modules).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/content.ts"),
      formats: ["iife"],
      name: "TetherContent",
      fileName: () => "content.js",
    },
  },
});
