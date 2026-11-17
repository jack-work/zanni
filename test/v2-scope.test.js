"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");

class FakeNode {
  constructor(tag, ns) {
    this.tagName = tag.toUpperCase();
    this.ns = ns || null;
    this.className = "";
    this.textContent = "";
    this.hidden = false;
    this.dataset = {};
    this.attrs = {};
    this.children = [];
    this.listeners = {};
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k.startsWith("data-")) {
      const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = String(v);
    }
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(child) {
    if (child && child.tagName === "FRAGMENT") {
      child.children.forEach(c => this.children.push(c));
    } else if (child) {
      this.children.push(child);
    }
    return child;
  }
  append(...kids) { kids.forEach(k => this.appendChild(k)); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  insertBefore(node, ref) {
    const idx = this.children.indexOf(ref);
    const items = node.tagName === "FRAGMENT" ? node.children : [node];
    if (idx < 0) this.children.push(...items);
    else this.children.splice(idx, 0, ...items);
  }
  get firstChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    return child;
  }
  remove() {}
  querySelector(sel) {
    if (sel === ".z2-empty") return this.children.find(c => c.className === "z2-empty") || null;
    return null;
  }
  addEventListener(ev, fn) { (this.listeners[ev] ??= []).push(fn); }
  click() { (this.listeners.click || []).forEach(fn => fn()); }
}

global.document = {
  createElement: tag => new FakeNode(tag),
  createElementNS: (ns, tag) => new FakeNode(tag, ns),
  createDocumentFragment: () => new FakeNode("fragment")
};

require(path.join(__dirname, "..", "assets/v2/z2-scope.js"));
const z2 = globalThis.z2;

assert.equal(z2.relTime("not-a-date", 100000), null);
assert.equal(z2.relTime(100000 - 180000, 100000), "3m ago");
assert.equal(z2.relTime(100000 + 7800000, 100000), "in 2h 10m");

assert.equal(z2.meterSVG(null, "unavailable"), null);
assert.equal(z2.meterSVG(NaN, "fresh"), null);
const freshMeter = z2.meterSVG(42, "fresh");
assert.equal(freshMeter.children[1].getAttribute("data-tone"), "ok");
assert.equal(freshMeter.children[1].getAttribute("data-stale"), "false");
const staleWarn = z2.meterSVG(82, "stale");
assert.equal(staleWarn.children[1].getAttribute("data-tone"), "warn");
assert.equal(staleWarn.children[1].getAttribute("data-stale"), "true");

const wf = z2.waterfallSVG([
  { label: "round 1", value: "120ms", segments: [{ start: 10, end: 80, color: "#3A6B2E", title: "prefill" }], ticks: [{ at: 80, title: "first token" }] }
], { start: 0, end: 100 });
function checkNoInlineStyle(node) {
  assert.equal(node.getAttribute("style"), null);
  node.children.forEach(checkNoInlineStyle);
}
checkNoInlineStyle(wf);
assert.equal(wf.children.length, 1);

const host = new FakeNode("div");
const logs = z2.logList(host, { maxRows: 3 });
logs.replace([
  { id: "2", t: 2000, severity: "WARN", host: "spain", body: "slow upstream", attrs: { provider: "gemini", ms: 940 } },
  { id: "1", t: 1000, severity: "INFO", host: "spain", body: "started", attrs: {} }
]);
const listNode = host.children[0];
assert.equal(listNode.children.length, 2);
const firstHead = listNode.children[0].children[0];
const firstDl = listNode.children[0].children[1];
assert.equal(firstDl.hidden, true);
firstHead.click();
assert.equal(firstDl.hidden, false);

logs.prepend([
  { id: "3", t: 3000, severity: "ERROR", host: "spain", body: "stream cut", attrs: { code: 502 } },
  { id: "2", t: 2000, severity: "WARN", host: "spain", body: "slow upstream", attrs: { provider: "gemini", ms: 940 } }
]);
assert.equal(listNode.children.length, 3);
assert.equal(listNode.children[0].dataset.key, "3");
assert.equal(firstDl.hidden, false);

logs.prepend([{ id: "4", t: 4000, severity: "INFO", host: "gluck", body: "tick", attrs: {} }]);
assert.equal(listNode.children.length, 3);

console.log("v2-scope.test: ok");
