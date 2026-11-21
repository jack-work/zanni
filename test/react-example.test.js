"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "examples/react.html"), "utf8");
const css = fs.readFileSync(path.join(root, "packages/react/src/zanni-react.css"), "utf8");
const used = new Set((html.match(/\bzr-[a-z-]+/g) || []).filter((c) => !/zr-composer-h/.test(c)));
assert.ok(used.size >= 15, "the example uses the package classes");
const missing = [...used].filter((c) => !new RegExp("\\." + c + "(?![\\w-])").test(css));
assert.deepStrictEqual(missing, [], "every zr- class in the example has a rule in zanni-react.css");
assert.ok(!/<script/.test(html), "the example needs no script");
for (const href of html.match(/href="\.\.\/[^"]+"/g) || []) {
  assert.ok(fs.existsSync(path.join(root, "examples", href.slice(6, -1))), "linked file exists: " + href);
}
const negative = css.replace(/\.zr-glyph/g, ".zr-gone");
assert.ok([...used].some((c) => !new RegExp("\\." + c + "(?![\\w-])").test(negative)), "the check notices a class with no rule");
console.log("react-example.test: ok");
