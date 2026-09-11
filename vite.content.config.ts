import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "chrome120",
    minify: false,
    sourcemap: true,
    lib: {
      entry: resolve(rootDir, "src/content/content.ts"),
      name: "AttentionLensContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});
