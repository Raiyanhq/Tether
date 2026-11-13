import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const OUT_DIR = process.env.OUT_DIR || "dist";

// Keeps manifest host_permissions in step with VITE_SERVER_URL, so going live is one env var.
function manifestHost(serverUrl: string): Plugin {
  return {
    name: "tether-manifest-host",
    closeBundle() {
      const file = resolve(__dirname, OUT_DIR, "manifest.json");
      const m = JSON.parse(readFileSync(file, "utf8"));
      m.host_permissions = [`${new URL(serverUrl).origin}/*`];
      writeFileSync(file, JSON.stringify(m, null, 2) + "\n");
    },
  };
}

// Pass 1: side panel (HTML + React) and background service worker.
// The content script is built separately (vite.content.config.ts) as an IIFE.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  return {
    plugins: [react(), manifestHost(env.VITE_SERVER_URL || "http://localhost:8787")],
    base: "./",
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200, // KaTeX + React; loaded locally from the extension, not over the network
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, "sidepanel.html"),
          background: resolve(__dirname, "src/background.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  };
});
