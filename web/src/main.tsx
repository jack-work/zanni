import { createStore, Provider } from "jotai";
import { createRoot } from "react-dom/client";
import { webSocketDial } from "figaro-forms";
import { endpointUrl, edgeSession } from "figaro-forms/auth";
import head from "../../assets/parla/figaro-head.png";
import "./styles/index.css";
import { App } from "./app";
import { TailClient, bootAtom, configureTraces, sessionUrl, traceDial } from "zanni-react/jotai";

const host = document.getElementById("app");
if (!host) throw new Error("figaro web needs #app");
const store = host.getAttribute("data-store") || "local";
const endpoint = host.getAttribute("data-endpoint") || "rpc";
const client = new TailClient({
  dial: traceDial(webSocketDial({ url: () => sessionUrl(endpointUrl(endpoint)), credential: edgeSession() })),
  pageBytes: 24000,
});
configureTraces(host.getAttribute("data-otel") ?? "otel");
const jotai = createStore();
jotai.set(bootAtom, {
  stores: { [store]: client },
  store,
  audioUrl: host.getAttribute("data-audio") || "audio",
  sttUrl: host.getAttribute("data-stt") || "stt",
  attachUrl: host.getAttribute("data-attach") || "attach",
  mark: host.getAttribute("data-mark") || head,
  landing: window.location.hash === "",
});
host.replaceChildren();
createRoot(host).render(
  <Provider store={jotai}>
    <App />
  </Provider>,
);
