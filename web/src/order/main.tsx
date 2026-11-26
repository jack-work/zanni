import { createStore, Provider } from "jotai";
import { createRoot } from "react-dom/client";
import { AriaClient } from "figaro-forms/aria";
import { webSocketDial } from "figaro-forms";
import { endpointUrl, edgeSession } from "figaro-forms/auth";
import "./order.css";
import { App } from "./app";
import { INTERIM_FORMS } from "./interim-forms";
import { interimFormsAtom, orderClientAtom } from "./state";

const host = document.getElementById("app");
if (!host) throw new Error("the order page needs #app");
const client = new AriaClient({
  dial: webSocketDial({ url: () => endpointUrl(host.getAttribute("data-endpoint") || "rpc"), credential: edgeSession() }),
  pageBytes: 24000,
});
const jotai = createStore();
jotai.set(orderClientAtom, client);
jotai.set(interimFormsAtom, INTERIM_FORMS);
host.replaceChildren();
createRoot(host).render(
  <Provider store={jotai}>
    <App />
  </Provider>,
);
