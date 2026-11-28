import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Plugin } from "vite";

const here = import.meta.dirname;

export function stageColour(): string {
  const css = readFileSync(resolve(here, "../assets/gesso/gesso.css"), "utf8");
  const found = /--stage:\s*(#[0-9a-fA-F]{6})\s*;/.exec(css);
  if (!found) throw new Error("gesso.css names no --stage colour");
  return found[1]!.toLowerCase();
}

export function appBase(): string {
  const base = process.env.FIGCHAT_BASE ?? "/chat/";
  if (!/^\/([A-Za-z0-9._~-]+\/)*$/.test(base)) throw new Error("FIGCHAT_BASE must be an absolute path ending in a slash, got " + base);
  return base;
}

type Screen = { w: number; h: number; ratio: number };

const SCREENS: Screen[] = JSON.parse(readFileSync(resolve(here, "icons/splash.json"), "utf8"));

function launchMedia(screen: Screen): string {
  return `(device-width: ${screen.w}px) and (device-height: ${screen.h}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`;
}

const ICONS = [
  { file: "icons/icon-192.png", sizes: "192x192", purpose: "any" },
  { file: "icons/icon-512.png", sizes: "512x512", purpose: "any" },
  { file: "icons/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" },
] as const;

export function webAppManifest(): Plugin {
  const colour = stageColour();
  const base = appBase();
  return {
    name: "figaro-web-app-manifest",
    apply: "build",
    buildStart() {
      const icons = ICONS.map((icon) => {
        const ref = this.emitFile({ type: "asset", name: basename(icon.file), source: readFileSync(resolve(here, icon.file)) });
        return { icon, ref };
      });
      for (const screen of SCREENS) {
        const side = `${screen.w * screen.ratio}x${screen.h * screen.ratio}`;
        this.emitFile({ type: "asset", name: `launch-${side}.png`, source: readFileSync(resolve(here, `icons/splash/${side}.png`)) });
      }
      const doc = {
        name: "figaro",
        lang: "en",
        short_name: "figaro",
        start_url: base,
        scope: base,
        display: "standalone",
        theme_color: colour,
        background_color: colour,
        icons: icons.map(({ icon, ref }) => ({ src: basename(this.getFileName(ref)), sizes: icon.sizes, type: "image/png", purpose: icon.purpose })),
      };
      this.emitFile({ type: "asset", name: "manifest.webmanifest", source: JSON.stringify(doc, null, 2) + "\n" });
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const names = Object.keys(ctx.bundle ?? {});
        const file = names.find((name) => /^assets\/manifest-[^/]+\.webmanifest$/.test(name));
        const launch = SCREENS.flatMap((screen) => {
          const side = `${screen.w * screen.ratio}x${screen.h * screen.ratio}`;
          const found = names.find((name) => name.startsWith(`assets/launch-${side}-`) && name.endsWith(".png"));
          return found ? [{ tag: "link", attrs: { rel: "apple-touch-startup-image", href: "./" + found, media: launchMedia(screen) }, injectTo: "head" as const }] : [];
        });
        return [
          { tag: "meta", attrs: { name: "theme-color", content: colour }, injectTo: "head" },
          ...launch,
          ...(file ? [{ tag: "link", attrs: { rel: "manifest", href: "./" + file, crossorigin: "use-credentials" }, injectTo: "head" as const }] : []),
        ];
      },
    },
  };
}
