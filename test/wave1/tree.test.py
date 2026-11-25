"""Bug 4, the tree: figaro web's topology mirrors the pager's :ls view.

Fixtures come from tmux captures of figaro 0.80.0 on an isolated daemon
(fixtures/pager-tree/*.ansi): topology.json is that daemon's @troupe and
@arias forms, ls-open.json and ls-tailA-open.json are the :ls rows parsed from
the captures (depth, label, count, role, mantra, the here mark, tones, the
cursor). The test serves the same forms from the fake door, attends the same
aria, and compares the web tree's rows with the pager's.
"""
import os

from kit import BOX_DRAWING, Door, Report, bundle_arg, fixture, until

from playwright.sync_api import sync_playwright

def open_tree(pg):
    if not pg.locator(".zr-pit[data-snap='half'], .zr-pit[data-snap='full']").count():
        pg.locator(".zr-pit-knob").focus()
        pg.keyboard.press("Enter")
        pg.wait_for_selector(".zr-pit[data-snap='half']")
    pg.locator(".zr-pit-row[data-action='tree']").click()
    pg.wait_for_selector(".fw-topology [role=treeitem]", timeout=10000)


ROWS_JS = """() => [...document.querySelectorAll('.fw-topology [role=treeitem]')].map((r) => {
  const q = (s) => r.querySelector(s);
  const text = (s) => (q(s) ? q(s).textContent.trim() : null);
  const tone = (s) => (q(s) ? q(s).dataset.tone || null : null);
  const label = q('.zr-tree-label');
  const box = label ? label.getBoundingClientRect() : null;
  return {
    depth: Number(r.getAttribute('aria-level')) - 1,
    label: text('.zr-tree-label'),
    count: text('.zr-tree-count'),
    role: text('.zr-tree-role'),
    mantra: text('.zr-tree-mantra'),
    here: r.hasAttribute('data-here'),
    hereGlyph: text('.zr-tree-here'),
    cursor: r.hasAttribute('data-cursor'),
    expanded: r.getAttribute('aria-expanded'),
    disclosure: !!q('.zr-tree-disclosure'),
    tones: { label: tone('.zr-tree-label'), role: tone('.zr-tree-role'), mantra: tone('.zr-tree-mantra'), here: tone('.zr-tree-here') },
    text: r.textContent,
    left: box ? box.left : null,
    id: r.dataset.id || null,
  };
})"""


def compare(rep, want_rows, got_rows, where):
    rep.check(len(got_rows) == len(want_rows), "%s: %d rows, the pager draws %d: %s" % (where, len(got_rows), len(want_rows), [g["label"] for g in got_rows]))
    for i, (w, g) in enumerate(zip(want_rows, got_rows)):
        at = "%s row %d (%s)" % (where, i, w["label"])
        rep.check(g["label"] == w["label"], "%s: label %r, want %r" % (at, g["label"], w["label"]))
        rep.check(g["depth"] == w["depth"], "%s: depth %r, want %r" % (at, g["depth"], w["depth"]))
        rep.check((g["count"] or "").strip("() ") == str(w["count"]), "%s: count %r, want (%d)" % (at, g["count"], w["count"]))
        rep.check(g["role"] == w.get("role"), "%s: role %r, want %r" % (at, g["role"], w.get("role")))
        got_mantra = g["mantra"].strip('"') if g["mantra"] else None
        rep.check(got_mantra == w.get("mantra"), "%s: mantra %r, want %r" % (at, g["mantra"], w.get("mantra")))
        rep.check(g["here"] == w["here"], "%s: here mark %r, want %r" % (at, g["here"], w["here"]))
        if w["here"]:
            rep.check(g["hereGlyph"] == "●", "%s: here glyph %r, want ●" % (at, g["hereGlyph"]))
        rep.check(g["cursor"] == w["cursor"], "%s: cursor %r, want %r" % (at, g["cursor"], w["cursor"]))
        if not w["cursor"]:
            for part, tone in w["tones"].items():
                rep.check(g["tones"].get(part) == tone, "%s: %s tone %r, want %r" % (at, part, g["tones"].get(part), tone))
        bad = [c for c in g["text"] if c in BOX_DRAWING]
        rep.check(not bad, "%s: guide characters in the row text %r" % (at, g["text"]))
        if w.get("id"):
            rep.check(g["id"] == w["id"], "%s: data-id %r, want %r" % (at, g["id"], w["id"]))
    for i in range(1, min(len(want_rows), len(got_rows))):
        a, b = got_rows[i - 1], got_rows[i]
        if b["depth"] > a["depth"] and a["left"] is not None and b["left"] is not None:
            rep.check(b["left"] > a["left"], "%s: row %d (%s) is not indented past its parent (%s vs %s)" % (where, i, b["label"], b["left"], a["left"]))
    for i, w in enumerate(want_rows):
        nxt = want_rows[i + 1] if i + 1 < len(want_rows) else None
        if nxt and nxt["depth"] > w["depth"] and i < len(got_rows):
            rep.check(got_rows[i]["expanded"] == "true", "%s: %s is open in the pager, aria-expanded=%r" % (where, w["label"], got_rows[i]["expanded"]))
            rep.check(got_rows[i]["disclosure"], "%s: %s has children and no disclosure element" % (where, w["label"]))


def main():
    bundle = bundle_arg()
    rep = Report("wave1 tree")
    topo = fixture("topology.json")
    want_open = fixture("ls-open.json")["rows"]
    want_tail = fixture("ls-tailA-open.json")["rows"]
    door = Door(bundle, 15, os.path.join(os.path.dirname(__file__), "fixtures", "topology.json"))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((1280, 800), (390, 844)):
                pg = browser.new_page(viewport={"width": width, "height": height})
                def rows_on_open():
                    pg.goto(door.url + "#/gluck/" + topo["attend"])
                    pg.wait_for_selector(".nodi-turn", timeout=10000)
                    open_tree(pg)
                    pg.wait_for_timeout(800)
                    compare(rep, want_open, pg.evaluate(ROWS_JS), "%d open" % width)

                rep.run("%dpx: rows on open match the pager's :ls" % width, rows_on_open)

                def keys():
                    pg.locator(".fw-topology").focus()
                    for k in ("j", "j", "j", "j"):
                        pg.keyboard.press(k)
                    pg.keyboard.press("l")
                    pg.wait_for_timeout(300)
                    compare(rep, want_tail, pg.evaluate(ROWS_JS), "%d after jjjj l" % width)
                    pg.keyboard.press("j")
                    pg.keyboard.press("h")
                    got = pg.evaluate(ROWS_JS)
                    cur = [r["label"] for r in got if r["cursor"]]
                    rep.check(cur == ["computer-railroad"], "%d: h from a leaf moves to its parent: cursor on %s" % (width, cur))
                    pg.keyboard.press("h")
                    got = pg.evaluate(ROWS_JS)
                    rep.check("deranged-cinnamon" not in [r["label"] for r in got], "%d: h on an open row closes it" % width)
                    pg.keyboard.press("g")
                    pg.keyboard.press("g")
                    got = pg.evaluate(ROWS_JS)
                    rep.check(got and got[0]["cursor"], "%d: gg puts the cursor on the first row" % width)
                    pg.keyboard.press("G")
                    got = pg.evaluate(ROWS_JS)
                    rep.check(got and got[-1]["cursor"], "%d: G puts the cursor on the last row" % width)
                    pg.keyboard.press("x")
                    until(pg, "document.body.innerText.includes('press x again to kill computer-railroad')", 3000)

                rep.run("%dpx: j k l h gg G x as the pager" % width, keys)

                def enter():
                    pg.locator(".fw-topology").focus()
                    pg.keyboard.press("g")
                    pg.keyboard.press("g")
                    for _ in range(4):
                        pg.keyboard.press("j")
                    pg.keyboard.press("Enter")
                    until(pg, "location.hash.endsWith('%s')" % topo["ids"]["tailB"], 5000)
                    open_tree(pg)
                    got = pg.evaluate(ROWS_JS)
                    here = [r["label"] for r in got if r["here"] and r["depth"] > 1]
                    rep.check(here == ["settler-siamese"], "%d: after Enter the here mark sits on the attended aria only: %s" % (width, here))

                rep.run("%dpx: Enter attends the cursor row" % width, enter)
                pg.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
