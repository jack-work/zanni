import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./app";

const host = document.getElementById("app");
if (!host) throw new Error("figaro web needs #app");
createRoot(host).render(<App />);
