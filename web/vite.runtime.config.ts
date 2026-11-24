import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const names = ["react", "jsx-runtime", "react-dom-client", "figaro-forms-glyphs", "pretext"] as const;
type Name = (typeof names)[number];
const requested = process.env.ZANNI_RUNTIME_ENTRY as Name | undefined;
if (!requested || !names.includes(requested)) throw new Error("ZANNI_RUNTIME_ENTRY must be one of " + names.join(", "));
const out = process.env.ZANNI_RUNTIME_OUT ?? "dist-runtime";

const STUB = resolve(import.meta.dirname, "bundle/runtime.ts");

function entryModule(name: Name): string {
  if (name === "react") {
    const keys = Object.keys(createRequire(import.meta.url)("react")).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== "default");
    return `import * as React from "react";\nexport default React;\nexport const { ${keys.join(", ")} } = React;\n`;
  }
  if (name === "jsx-runtime") return `export { Fragment, jsx, jsxs } from "react/jsx-runtime";\n`;
  if (name === "react-dom-client") return `export { createRoot, hydrateRoot, version } from "react-dom/client";\n`;
  if (name === "pretext") return `export * from "@chenglou/pretext";\n`;
  return `export * from "figaro-forms/glyphs";\n`;
}

const SHARED_REACT = "\0zanni-runtime-react";

function sharedReact(): Plugin {
  return {
    name: "zanni-runtime-shared-react",
    enforce: "pre",
    resolveId(source, importer) {
      if (source !== "react" || (requested !== "jsx-runtime" && requested !== "react-dom-client")) return null;
      return importer === SHARED_REACT ? { id: "react", external: true } : SHARED_REACT;
    },
    load(id) {
      return id === SHARED_REACT ? `export * from "react";\n` : null;
    },
  };
}

function entry(): Plugin {
  return {
    name: "zanni-runtime-entry",
    enforce: "pre",
    load(id) {
      return id === STUB ? entryModule(requested!) : null;
    },
  };
}

export default defineConfig({
  plugins: [entry(), sharedReact()],
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    outDir: out,
    emptyOutDir: requested === "react",
    sourcemap: false,
    minify: true,
    cssCodeSplit: false,
    target: "es2023",
    lib: { entry: STUB, formats: ["es"], fileName: () => requested + ".js" },
    rollupOptions: { output: { codeSplitting: false } },
  },
  root: resolve(import.meta.dirname),
});
