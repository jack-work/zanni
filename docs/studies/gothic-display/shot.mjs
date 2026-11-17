import { spawn } from "node:child_process";
import fs from "node:fs";

const [url, out, width = "1200", sel = "", dpr = "1"] = process.argv.slice(2);
const prof = fs.mkdtempSync("/tmp/shot-");
const proc = spawn("chromium", ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files", `--user-data-dir=${prof}`, "--remote-debugging-port=0", "about:blank"]);
const ws0 = await new Promise((r) => { let b = ""; proc.stderr.on("data", (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) r(m[1]); }); });
const list = await fetch(ws0.replace("ws://", "http://").replace(/\/devtools\/.*/, "/json/list")).then((r) => r.json());
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await cdp("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;

await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: +width, height: 900, deviceScaleFactor: +dpr, mobile: false });
await cdp("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 600));
await ev("document.fonts.ready.then(() => true)");
await new Promise((r) => setTimeout(r, 300));
let clip;
if (sel) {
  const b = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height}})()`);
  clip = { ...b, scale: 1 };
} else {
  const h = await ev("Math.ceil(document.documentElement.scrollHeight)");
  clip = { x: 0, y: 0, width: +width, height: h, scale: 1 };
}
const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip });
fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
const fonts = await ev("[...document.fonts].map(f=>f.family+':'+f.status).join(' | ')");
console.log(out, Math.round(clip.width) + "x" + Math.round(clip.height), fonts);
proc.kill("SIGKILL"); fs.rmSync(prof, { recursive: true, force: true }); process.exit(0);
