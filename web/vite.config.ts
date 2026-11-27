import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const assets = resolve(import.meta.dirname, "../assets");
const pkg = resolve(import.meta.dirname, "../packages/react/src");
const door = process.env.FIGCHAT_DOOR ?? "http://127.0.0.1:8099";

function zanniModules(): Plugin {
  const files = new Set(["nodi/nodi.js", "voce/voce.js", "figchat/speech.js", "../examples/aria-mock.js"].map((f) => resolve(assets, f)));
  return {
    name: "zanni-modules",
    enforce: "pre",
    transform(code, id) {
      if (!files.has(id.split("?")[0] ?? "")) return null;
      return { code: `var module = { exports: {} };\n${code}\nexport default module.exports;\n`, map: null };
    },
  };
}

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      { find: /^zanni-react\/jotai$/, replacement: resolve(pkg, "jotai.ts") },
      { find: /^zanni-react\/jotai\/(.+)$/, replacement: resolve(pkg, "jotai") + "/$1" },
      { find: /^zanni-react$/, replacement: resolve(pkg, "index.ts") },
    ],
    dedupe: ["react", "react-dom", "jotai", "figaro-forms"],
  },
  plugins: [zanniModules(), react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
  },
  server: {
    fs: { allow: [resolve(import.meta.dirname, "..")] },
    proxy: {
      "/rpc": { target: door, ws: true },
      "/audio": { target: door, ws: true },
      "/stt": { target: door },
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
  },
});
