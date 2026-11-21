import { createServer } from "node:http";
import { join } from "node:path";

const [kit, sock] = process.argv.slice(2);
const { startFakeSpeech } = await import(join(kit, "fake-speech.ts"));
const fake = await startFakeSpeech();

const ctl = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const body = [];
  req.on("data", (c) => body.push(c));
  req.on("end", () => {
    if (req.method === "POST" && url.pathname === "/set") {
      const set = JSON.parse(Buffer.concat(body).toString() || "{}");
      for (const k of ["pcmPerText", "holdUrl", "streamFailAfter", "sttStatus", "rejectVoice"]) if (k in set) fake[k] = set[k];
    }
    const calls = fake.calls.map((c) => ({ url: c.url, texts: c.frames.filter((f) => typeof f.text === "string").length, ended: c.frames.some((f) => f.end === true), closed: c.closed }));
    const streams = fake.streams.map((s) => ({ url: s.url, audio: s.audio.length, closed: s.closed, frames: s.frames.map((f) => f.type) }));
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ calls, streams, clips: fake.clips.length }));
  });
});
ctl.listen(0, "127.0.0.1", () => {
  process.stdout.write(`${fake.path} ${ctl.address().port}\n`);
});
const stop = () => void fake.stop().then(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
