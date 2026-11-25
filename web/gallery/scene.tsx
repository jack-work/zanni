import { createStore, Provider } from "jotai";
import { createRoot } from "react-dom/client";
import { AriaClient } from "figaro-forms/aria";
import { configureTraces } from "zanni-react";
import { bootAtom, parseTemplates } from "zanni-react/jotai";
import ariaMock from "../../examples/aria-mock.js";
import head from "../../assets/parla/figaro-head.png";
import "../src/styles/index.css";
import { App } from "../src/app";
import { scenes } from "./scenes";
import { FRAMES, STORE, type AriaMock, type MockCore, type Scene } from "./stage";

interface Gallery {
  scenes: { name: string; frame: string; width: number; height: number; note: string }[];
  current: string;
  ready: boolean;
  errors: string[];
}

declare global {
  interface Window {
    gallery: Gallery;
  }
}

const gallery: Gallery = { scenes: scenes.map((s) => ({ name: s.name, frame: s.frame, ...FRAMES[s.frame], note: s.note ?? "" })), current: "", ready: false, errors: [] };
window.gallery = gallery;
window.addEventListener("error", (e) => {
  if (!e.message.startsWith("ResizeObserver loop")) gallery.errors.push(e.message);
});
window.addEventListener("unhandledrejection", (e) => gallery.errors.push(String(e.reason)));
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  gallery.errors.push(args.map(String).join(" "));
  consoleError(...args);
};

function steppedTimers(budget: number): { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void } {
  let spent = 0;
  return {
    set(fn) {
      if (spent >= budget) return 0;
      spent++;
      return setTimeout(fn, 0);
    },
    clear(handle) {
      clearTimeout(handle as number);
    },
  };
}

function frozenDial(): AriaClient {
  return new AriaClient({
    dial: async (events) => ({
      send: () => events.closed("401"),
      close: () => undefined,
    }),
    retryMinMs: 5,
    retryMaxMs: 10,
  });
}

function pick(): Scene | undefined {
  const query = new URLSearchParams(window.location.search).get("scene");
  const named = query ?? window.location.hash.replace(/^#/, "");
  return scenes.find((s) => s.name === named);
}

function settled(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 60))));
}

async function boot(): Promise<void> {
  const scene = pick();
  const theme = new URLSearchParams(window.location.search).get("theme");
  if (theme === "dark" || theme === "light") document.documentElement.style.colorScheme = theme;
  const host = document.getElementById("app");
  if (!host) throw new Error("the gallery needs #app");
  if (!scene) {
    host.textContent = scenes.map((s) => s.name).join("\n");
    host.style.whiteSpace = "pre";
    gallery.ready = true;
    return;
  }
  gallery.current = scene.name;
  window.history.replaceState(null, "", `?scene=${scene.name}${theme ? "&theme=" + theme : ""}#`);
  configureTraces("");
  const core = (ariaMock as AriaMock).create({
    now: () => Date.now(),
    step: scene.mock?.step ?? 60,
    history: scene.mock?.history,
    pageBytes: 6000,
    timers: scene.mock?.steps === undefined ? undefined : steppedTimers(scene.mock.steps),
  }) as MockCore;
  const client = scene.signedOut ? frozenDial() : new AriaClient({ dial: core.dial, pageBytes: 24000 });
  const store = createStore();
  store.set(bootAtom, {
    stores: { [STORE]: client },
    store: STORE,
    audioUrl: "/gallery/none/audio",
    sttUrl: "/gallery/none/stt",
    attachUrl: "/gallery/none/attach",
    mark: head,
    templates: parseTemplates("25b2c127e6f10f67c853417a77b41de4=New figaro"),
  });
  await scene.setup?.(core, store);
  host.replaceChildren();
  createRoot(host).render(<Provider store={store}>{scene.render ? scene.render(core, store) : <App />}</Provider>);
  await settled();
  await scene.after?.(core, store, host);
  await settled();
  gallery.ready = true;
  document.documentElement.dataset.sceneReady = "";
}

void boot();
