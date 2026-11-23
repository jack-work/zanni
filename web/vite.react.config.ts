import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const assets = resolve(import.meta.dirname, "../assets");
const pkg = resolve(import.meta.dirname, "../packages/react/src");
const entry = process.env.ZANNI_REACT_ENTRY === "react-jotai" ? "react-jotai" : "react";
const out = process.env.ZANNI_REACT_OUT ?? `dist-${entry}`;

function zanniModules(): Plugin {
  const files = new Set(["nodi/nodi.js", "voce/voce.js", "figchat/speech.js"].map((f) => resolve(assets, f)));
  return {
    name: "zanni-modules",
    enforce: "pre",
    transform(code, id) {
      if (!files.has(id.split("?")[0] ?? "")) return null;
      return { code: `var module = { exports: {} };\n${code}\nexport default module.exports;\n`, map: null };
    },
  };
}

function coreIsExternal(): Plugin {
  const jotaiDir = resolve(pkg, "jotai") + "/";
  const jotaiEntry = resolve(pkg, "jotai.ts");
  return {
    name: "zanni-core-external",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (entry !== "react-jotai" || !importer || !source.startsWith(".")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const file = resolved?.id.split("?")[0] ?? "";
      if (file.startsWith(pkg + "/") && !file.startsWith(jotaiDir) && file !== jotaiEntry) return { id: "zanni-react", external: true };
      return null;
    },
  };
}

function workletBesideModule(): Plugin {
  const worklet = resolve(assets, "figchat/pcm-worklet.js");
  return {
    name: "zanni-worklet-beside-module",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith("pcm-worklet.js?url") || !importer) return null;
      return `\0worklet:${resolve(importer, "..", source.slice(0, -"?url".length))}`;
    },
    async load(id) {
      if (!id.startsWith("\0worklet:")) return null;
      const file = id.slice("\0worklet:".length);
      if (file !== worklet) this.error(`unexpected worklet ${file}`);
      this.addWatchFile(file);
      this.emitFile({ type: "asset", fileName: "pcm-worklet.js", source: readFileSync(file) });
      return `export default new URL(/* @vite-ignore */ "pcm-worklet.js", import.meta.url).href;`;
    },
  };
}

const externals = [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^figaro-forms(\/.*)?$/, /^jotai(\/.*)?$/, "zanni-react"];

export default defineConfig({
  plugins: [zanniModules(), workletBesideModule(), coreIsExternal()],
  build: {
    outDir: out,
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    target: "es2023",
    lib: {
      entry: resolve(import.meta.dirname, `bundle/${entry}.ts`),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "index",
    },
    rollupOptions: { external: externals, output: { codeSplitting: false } },
  },
});
