// zanni2: the pure parts of z2.js (sort keys and order) and the token check. node test/v2.test.js
"use strict";
const assert = require("assert");
const { execFileSync } = require("child_process");
const path = require("path");
global.window = undefined;
require(path.join(__dirname, "..", "assets/v2/z2.js"));
const { _cellKey: key, _compare: cmp } = globalThis.z2;
const td = (t, v) => ({ textContent: t, dataset: v == null ? {} : { v } });
assert.strictEqual(key(td("1,234")), 1234);
assert.strictEqual(key(td("—")), null);
assert.strictEqual(key(td("barr")), "barr");
assert.strictEqual(key(td("display", "7")), 7, "data-v wins over the text");
const vals = [3, null, 10, "b", 1, "a"];
const asc = vals.slice().sort((a, b) => cmp(a, b, 1));
assert.deepStrictEqual(asc, [1, 3, 10, "a", "b", null], "numbers, then text, blanks last");
const desc = vals.slice().sort((a, b) => cmp(a, b, -1));
assert.strictEqual(desc[desc.length - 1], null, "blanks stay last when descending");
// tokens: the generated files are current and every contrast rule passes...
execFileSync(path.join(__dirname, "..", "bin/z2-build"), ["--check"]);
// ...and the check is not a no-op: a failing token must make it exit non-zero (negative control on a temp copy)
const fs = require("fs"), os = require("os");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "z2-"));
fs.mkdirSync(path.join(tmp, "assets/v2"), { recursive: true }); fs.mkdirSync(path.join(tmp, "bin"));
const tok = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/v2/tokens.json"), "utf8"));
tok.themes.band.colors["--z-muted"] = ["#B9A090", "#A5887B"]; // light muted far below 4.5:1
fs.writeFileSync(path.join(tmp, "assets/v2/tokens.json"), JSON.stringify(tok));
fs.copyFileSync(path.join(__dirname, "..", "bin/z2-build"), path.join(tmp, "bin/z2-build"));
let failed = false;
try { execFileSync("python3", [path.join(tmp, "bin/z2-build")], { stdio: "pipe" }); } catch (e) { failed = /CONTRAST FAIL band light --z-muted/.test(String(e.stderr)); }
assert.ok(failed, "z2-build must refuse a token under AA, naming it");
console.log("v2.test: ok");
