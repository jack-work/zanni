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

const crypto = require("crypto");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/manifest.json"), "utf8"));
const page = fs.readFileSync(path.join(root, "examples/react-bundle.html"), "utf8");
const inline = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/\bsrc=/.test(m[1]));
assert.strictEqual(inline.length, 1, "the page carries one inline script");
assert.ok(/type="importmap"/.test(inline[0][1]), "and it is the import map");
const mapText = inline[0][2];
const hash = crypto.createHash("sha256").update(mapText).digest("base64");
const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(page)[1];
assert.ok(policy.includes("script-src 'self' 'sha256-" + hash + "'"), "the CSP names the import map's sha256");
assert.ok(!/unsafe-inline|unsafe-eval/.test(policy), "the policy stays strict");
assert.ok(!/\sstyle=|<style\b|\son[a-z]+=/.test(page), "no inline style or handler");
const map = JSON.parse(mapText).imports;
assert.ok(/^\/zanni\/react\/\d+\.\d+\.\d+\/index\.js$/.test(map["zanni-react"]), "the map points zanni-react at the served bundle");
const version = /\/zanni\/react\/([^/]+)\//.exec(map["zanni-react"])[1];
assert.ok(page.includes("/zanni/react/" + version + "/index.css"), "the stylesheet comes from the same version");
const script = fs.readFileSync(path.join(root, "examples/react-bundle.js"), "utf8");
const imports = [...script.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(imports.filter((i) => !(i in map)), [], "every import of the example script is in the map");
const listed = manifest.components.react.bundle.exports["zanni-react"];
for (const m of script.matchAll(/import \{([^}]*)\} from "zanni-react"/g)) {
  for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) assert.ok(listed.includes(n), "the manifest lists " + n);
}
assert.ok(!/<script/.test(script), "the script is a module file");
assert.ok(manifest.components.react.bundle.example === "examples/react-bundle.html", "the manifest points at the example");
assert.ok(JSON.stringify(manifest.components.react.bundle.exports["zanni-react"]) !== JSON.stringify(manifest.components.react.bundle.exports["zanni-react/jotai"]), "both bundles list their own exports");
const wrongMap = mapText.replace(/"react":/, '"reakt":');
assert.notStrictEqual(crypto.createHash("sha256").update(wrongMap).digest("base64"), hash, "a changed map changes the hash the policy must carry");

const shellPage = fs.readFileSync(path.join(root, "examples/shell.html"), "utf8");
const shellMap = /<script type="importmap">([\s\S]*?)<\/script>/.exec(shellPage)[1];
const shellHash = crypto.createHash("sha256").update(shellMap).digest("base64");
assert.ok(shellPage.includes("script-src 'self' 'sha256-" + shellHash + "'"), "the Shell page's policy names its import map's sha256");
assert.ok(!/unsafe-inline|unsafe-eval/.test(shellPage) && !/\sstyle=|<style\b|\son[a-z]+=/.test(shellPage), "the Shell page stays strict");
const shellImports = JSON.parse(shellMap).imports;
const shellScript = fs.readFileSync(path.join(root, "examples/shell.js"), "utf8");
assert.deepStrictEqual([...shellScript.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).filter((i) => !(i in shellImports)), [], "every import of the Shell example is in its map");
for (const spec of ["react", "react/jsx-runtime", "react-dom/client", "figaro-forms/glyphs", "@chenglou/pretext"]) assert.ok(/^\/zanni\/runtime\/\d+\.\d+\.\d+\/[a-z-]+\.js$/.test(shellImports[spec]), spec + " resolves to the served runtime");
for (const m of shellScript.matchAll(/import \{([^}]*)\} from "zanni-react"/g)) for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) assert.ok(listed.includes(n), "the manifest lists " + n);
console.log("react-example.test: ok");
