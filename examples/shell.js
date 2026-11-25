import { createElement as h, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { Shell } from "zanni-react";

const log = (window.shellLog = []);
const note = (kind, detail) => log.push([kind, detail]);

function mount(hosts) {
  note("hosts", { main: hosts.main.id });
  const doc = document.createElement("article");
  doc.className = "doc";
  const head = document.createElement("h2");
  head.className = "doc-head";
  head.id = "doc-head";
  head.textContent = "src/long.go";
  doc.append(head);
  for (let i = 0; i < 160; i++) {
    const p = document.createElement("p");
    p.id = "line-" + i;
    p.textContent = "Line " + i + ": the header leaves on scroll down and returns on scroll up, and this sentence is long enough to be selected and to wrap on a phone.";
    doc.append(p);
  }
  hosts.main.append(doc);
}

function link(id, text, href) {
  return h("a", { id, href: href || "#" + id }, text);
}

function Page() {
  const [crumb] = useState("src/long.go");
  const onTheme = useCallback((t) => note("theme", t), []);
  const hosts = useCallback(mount, []);
  return h(Shell, {
    header: {
      mark: link("b-repo", "fx"),
      identity: h("nav", { id: "b-crumbs", className: "crumbs" }, crumb),
      nav: h("span", { id: "b-nav" }, link("b-history", "History"), " ", link("b-diff", "Diff")),
      status: h("span", { id: "b-live", className: "chip" }, "live"),
      tools: h("button", { id: "b-zoom", type: "button" }, "zoom"),
      actions: h("button", { id: "b-stale", type: "button", hidden: true }, "changes · reload"),
    },
    fold: ["mark", "nav", "status", "tools"],
    storage: "paperd",
    onTheme,
    hosts,
  });
}

createRoot(document.getElementById("root")).render(h(Page));
