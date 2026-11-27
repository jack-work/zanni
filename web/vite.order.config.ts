import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const pkg = resolve(import.meta.dirname, "../packages/react/src");
const door = process.env.ORDER_DOOR ?? "http://127.0.0.1:8099";

export default defineConfig({
  root: resolve(import.meta.dirname, "order"),
  base: "./",
  resolve: {
    alias: [
      { find: /^zanni-react\/jotai$/, replacement: resolve(pkg, "jotai.ts") },
      { find: /^zanni-react\/jotai\/(.+)$/, replacement: resolve(pkg, "jotai") + "/$1" },
      { find: /^zanni-react$/, replacement: resolve(pkg, "index.ts") },
    ],
    dedupe: ["react", "react-dom", "jotai", "figaro-forms"],
  },
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "dist-order"),
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
  },
  server: {
    fs: { allow: [resolve(import.meta.dirname, "..")] },
    proxy: { "/rpc": { target: door, ws: true } },
  },
});
