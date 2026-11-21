import { createStore, Provider } from "jotai";
import { createRoot } from "react-dom/client";
import { AriaClient } from "figaro-forms/aria";
import { webSocketDial } from "figaro-forms";
import { doorUrl, edgeSession } from "figaro-forms/auth";
import head from "../../assets/parla/figaro-head.png";
import "./styles/index.css";
import { App } from "./app";
import { bootAtom } from "./state/boot";

const host = document.getElementById("app");
if (!host) throw new Error("figaro web needs #app");
const store = host.getAttribute("data-store") || "local";
const door = host.getAttribute("data-door") || "door";
const client = new AriaClient({
  dial: webSocketDial({ url: () => doorUrl(door), credential: edgeSession() }),
  pageBytes: 24000,
});
const jotai = createStore();
jotai.set(bootAtom, {
  stores: { [store]: client },
  store,
  audioUrl: host.getAttribute("data-audio") || "audio",
  sttUrl: host.getAttribute("data-stt") || "stt",
  mark: host.getAttribute("data-mark") || head,
});
host.replaceChildren();
createRoot(host).render(
  <Provider store={jotai}>
    <App />
  </Provider>,
);
