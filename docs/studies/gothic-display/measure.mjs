import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const faces = JSON.parse(fs.readFileSync(path.join(here, "faces.json"), "utf8"));
faces.push({ id: "ebg", name: "EB Garamond", family: "EB Garamond", file: "fonts/eb-garamond.woff2" });
const sizes = [16, 19, 20, 26, 28, 32, 38, 40, 52, 56];

const prof = fs.mkdtempSync("/tmp/measure-");
const proc = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files", `--user-data-dir=${prof}`, "--remote-debugging-port=0", "about:blank"]);
const ws0 = await new Promise((r) => { let b = ""; proc.stderr.on("data", (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) r(m[1]); }); });
const list = await fetch(ws0.replace("ws://", "http://").replace(/\/devtools\/.*/, "/json/list")).then((r) => r.json());
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: "file://" + path.join(here, "measure.html") });
await new Promise((r) => setTimeout(r, 800));
const r = await cdp("Runtime.evaluate", { expression: `run(${JSON.stringify(faces)}, ${JSON.stringify(sizes)})`, awaitPromise: true, returnByValue: true });
if (r.error || r.result.exceptionDetails) { console.error(JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 800)); proc.kill("SIGKILL"); process.exit(1); }
fs.writeFileSync(path.join(here, "metrics.json"), JSON.stringify(r.result.result.value));
console.log("rows", r.result.result.value.length);
proc.kill("SIGKILL"); fs.rmSync(prof, { recursive: true, force: true }); process.exit(0);
