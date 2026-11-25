import { parts } from "./parts";
import { scenes } from "./scenes";
import { FRAMES } from "./stage";

const host = document.getElementById("gi");
if (!host) throw new Error("the gallery index needs #gi");

function heading(tag: "h2" | "h3", text: string, id?: string): HTMLElement {
  const h = document.createElement(tag);
  h.textContent = text;
  if (id) h.id = id;
  return h;
}

function pair(page: string, key: string, name: string, width: number, height: number, note: string): HTMLElement {
  const item = document.createElement("section");
  item.className = "gi-item";
  const title = document.createElement("h4");
  title.textContent = name;
  const text = document.createElement("p");
  text.textContent = note;
  const row = document.createElement("div");
  row.className = "gi-pair";
  for (const theme of ["light", "dark"]) {
    const frame = document.createElement("iframe");
    frame.loading = "lazy";
    frame.width = String(width);
    frame.height = String(height);
    frame.title = `${name} (${theme})`;
    frame.src = `./${page}.html?${key}=${name}&theme=${theme}`;
    row.append(frame);
  }
  item.append(title, text, row);
  return item;
}

host.append(heading("h2", "Scenes", "scenes"));
for (const s of scenes) {
  const size = FRAMES[s.frame];
  host.append(pair("scene", "scene", s.name, size.width, size.height, s.note ?? ""));
}

host.append(heading("h2", "Parts", "parts"));
let group = "";
for (const p of parts) {
  if (p.group !== group) {
    group = p.group;
    host.append(heading("h3", group));
  }
  host.append(pair("part", "part", p.name, p.width, p.height, p.note ?? ""));
}
