"""Bug 3, glyph centring: every glyph sits in the centre of its pill or row.

The ink box (canvas measureText actualBoundingBox in the glyph's computed
font, placed on the text box's baseline) is what the eye sees, so it is the
one held to the centre: a pill's glyph against the pill, a row glyph
horizontally against its own slot and vertically against the row, within
1 px on both axes. The text box (Range.getBoundingClientRect over the
glyph's own characters, spaces excluded) only has to stay inside that box:
fallback faces put symbol ink off the centre of their em box, so centring
the ink moves the text box, and no layout can centre both. Chromium and
WebKit, at 390x844 and 1280x800.
"""
import json

from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
TOL = 1.0

MEASURE_JS = """() => {
  const out = [];
  const content = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const px = (v) => parseFloat(v) || 0;
    return {
      left: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft),
      right: r.right - px(cs.borderRightWidth) - px(cs.paddingRight),
      top: r.top + px(cs.borderTopWidth) + px(cs.paddingTop),
      bottom: r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom),
    };
  };
  const inkRange = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let first = null, last = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.data;
      for (let i = 0; i < s.length; i++) {
        if (/\\s/.test(s[i])) continue;
        if (!first) first = [n, i];
        last = [n, i + (s.codePointAt(i) > 0xffff ? 2 : 1)];
      }
    }
    if (!first) return null;
    const r = document.createRange();
    r.setStart(first[0], first[1]);
    r.setEnd(last[0], last[1]);
    return r.getBoundingClientRect();
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const push = (kind, glyphEl, hBox, vBox, name) => {
    if (!visible(glyphEl)) return;
    const g = inkRange(glyphEl);
    if (!g) return;
    const h = content(hBox), v = content(vBox);
    const text = glyphEl.textContent.trim();
    const cs = getComputedStyle(glyphEl);
    const ctx = (window.__inkCanvas = window.__inkCanvas || document.createElement('canvas')).getContext('2d');
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    const base = g.top + (g.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    const ink = { left: g.left - m.actualBoundingBoxLeft, right: g.left + m.actualBoundingBoxRight, top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent };
    out.push({
      kind, name, glyph: text, font: cs.fontFamily,
      out: Math.max(h.left - g.left, g.right - h.right, v.top - g.top, g.bottom - v.bottom, 0),
      ix: (ink.left + ink.right) / 2 - (h.left + h.right) / 2,
      iy: (ink.top + ink.bottom) / 2 - (v.top + v.bottom) / 2,
    });
  };
  for (const pill of document.querySelectorAll('.zr-pill')) {
    const glyph = pill.querySelector('.zr-pill-glyph') || pill;
    push('pill', glyph, pill, pill, pill.getAttribute('aria-label'));
  }
  for (const row of document.querySelectorAll('[role=treeitem], .zr-pit-row')) {
    const name = (row.querySelector('.zr-tree-label, .zr-pit-row-label') || row).textContent.trim().slice(0, 24);
    for (const slot of row.querySelectorAll('[data-glyph], .zr-tree-mark, .zr-tree-badge, .zr-tree-here, .zr-tree-disclosure, .zr-pit-row-glyph')) {
      push('row', slot, slot, row, name + ' ' + (slot.className || ''));
    }
  }
  return out;
}"""


def open_pit(pg):
    if not pg.locator(".zr-pit[role=dialog]").count():
        pg.locator(".zr-pit-knob").focus()
        pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[data-snap='half']")


def main():
    bundle = bundle_arg()
    rep = Report("wave1 glyph centring")
    door = Door(bundle, 15)
    worst = {}
    try:
        with sync_playwright() as p:
            for engine_name in ("chromium", "webkit"):
                engine = getattr(p, engine_name)
                browser = engine.launch()
                for width, height in ((390, 844), (1280, 800)):
                    ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
                    pg = ctx.new_page()
                    where = "%s %d" % (engine_name, width)

                    def measure(view):
                        until(pg, "document.fonts.status === 'loaded'", 8000)
                        found = pg.evaluate(MEASURE_JS)
                        rep.check(found, "%s %s: no glyphs found" % (where, view))
                        for m in found:
                            key = "%s %s %s %s" % (where, view, m["kind"], m["name"])
                            worst[key] = (round(m["out"], 2), round(m["ix"], 2), round(m["iy"], 2), m["glyph"])
                            rep.check(m["out"] <= TOL, "%s %s: %s %r glyph %r text box leaves its box by %.2f px" % (where, view, m["kind"], m["name"], m["glyph"], m["out"]))
                            rep.check(abs(m["ix"]) <= TOL and abs(m["iy"]) <= TOL, "%s %s: %s %r glyph %r ink off centre by dx=%.2f dy=%.2f px (font %s)" % (where, view, m["kind"], m["name"], m["glyph"], m["ix"], m["iy"], m["font"]))

                    def aria_view():
                        pg.goto(door.url + "#/gluck/" + MAIN)
                        until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                        pg.wait_for_selector(".zr-pill")
                        pg.wait_for_timeout(600)
                        measure("aria")

                    rep.run(where + ": composer pills and side tree", aria_view)

                    def list_view():
                        pg.goto(door.url + "#/")
                        pg.wait_for_selector("[role=treeitem]")
                        pg.wait_for_timeout(400)
                        measure("list")

                    rep.run(where + ": list rows", list_view)

                    def pit_view():
                        pg.goto(door.url + "#/gluck/" + MAIN)
                        until(pg, "document.querySelector('.fw').dataset.link === 'live'", 15000)
                        open_pit(pg)
                        pg.wait_for_timeout(400)
                        measure("pit")

                    rep.run(where + ": control pit rows", pit_view)
                    ctx.close()
                browser.close()
    finally:
        door.stop()
    print(json.dumps(worst, ensure_ascii=False, indent=0)[:6000])
    rep.finish()


main()
