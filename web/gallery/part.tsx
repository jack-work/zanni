import { createRoot } from "react-dom/client";
import "../src/styles/index.css";
import "./gallery.css";
import { parts } from "./parts";

interface Gallery {
  parts: { name: string; group: string; width: number; height: number; note: string }[];
  ready: boolean;
  errors: string[];
}

declare global {
  interface Window {
    partsGallery: Gallery;
  }
}

const gallery: Gallery = { parts: parts.map((p) => ({ name: p.name, group: p.group, width: p.width, height: p.height, note: p.note ?? "" })), ready: false, errors: [] };
window.partsGallery = gallery;
window.addEventListener("error", (e) => {
  if (!e.message.startsWith("ResizeObserver loop")) gallery.errors.push(e.message);
});
window.addEventListener("unhandledrejection", (e) => gallery.errors.push(String(e.reason)));
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  gallery.errors.push(args.map(String).join(" "));
  consoleError(...args);
};

const query = new URLSearchParams(window.location.search);
const theme = query.get("theme");
if (theme === "dark" || theme === "light") document.documentElement.style.colorScheme = theme;
const part = parts.find((p) => p.name === query.get("part"));
const host = document.getElementById("app");
if (!host) throw new Error("the gallery needs #app");
if (part) {
  const View = part.view;
  createRoot(host).render(<View />);
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => (gallery.ready = true), 80)));
} else {
  gallery.ready = true;
}
