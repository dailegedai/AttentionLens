import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

function copyManifest(): Plugin {
  return {
    name: "copy-manifest",
    apply: "build",
    closeBundle() {
      copyFileSync(resolve(rootDir, "manifest.json"), resolve(rootDir, "dist/manifest.json"));
    },
  };
}

export default defineConfig({
  root: rootDir,
  publicDir: false,
  plugins: [copyManifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    minify: false,
    sourcemap: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "src/popup/popup.html"),
        background: resolve(rootDir, "src/background/background.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
