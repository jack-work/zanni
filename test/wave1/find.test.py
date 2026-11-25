"""Bug 4 again, the tree's find: figaro web's `/` finds as the pager's `/`.

Fixtures come from tmux captures of figaro 0.86.5's :ls on an isolated daemon
(fixtures/pager-find/*.txt: the screen after typing the query, first line
`/query  k/n`) and roles.json, that daemon's @troupe and @arias forms with a
role row, its holder and the holder's forks. The test serves the same forms
from the fake door, attends the same aria, types the same query and compares
the hit count, the landing row and the rows around the hits with the pager's.
Known differences are named in DIFFERENT: the pager draws a `forks` row between
a row and its children, labels a role row with its form id, and finds nothing
for `fork` because its `forks` key matches first.
"""
import os
import re

from kit import Door, Report, bundle_arg, fixture, until

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROLE_FORM = "@744a27e38ebd91da1988a0445709fb7e"
ROLE_LABEL = "@King of Spain"

ROWS_JS = """() => [...document.querySelectorAll('.fw-topology [role=treeitem]')].map((r) => {
  const text = (s) => { const e = r.querySelector(s); return e ? e.textContent.trim() : null; };
  return {
    depth: Number(r.getAttribute('aria-level')) - 1,
    label: text('.zr-tree-label'),
    leaf: !!r.querySelector('.zr-tree-colon'),
    value: text('.zr-tree-value'),
    cursor: r.hasAttribute('data-cursor'),
    id: r.dataset.id || null,
    hits: [...r.querySelectorAll('mark.zr-tree-hit')].map((m) => m.textContent),
  };
})"""


def pager(name):
    with open(os.path.join(HERE, "fixtures", "pager-find", name + ".txt")) as fh:
        lines = [ln.rstrip("\n") for ln in fh]
    head = re.match(r"^/(.*?)\s+(\d+)/(\d+)$", lines[0])
    rows = []
    forks = []
    for ln in lines[1:]:
        if ln.startswith("⌕"):
            break
        m = re.match(r"^((?:[│ ]  |├─ |└─ )*)(.*)$", ln[2:])
        indent, text = m.group(1), m.group(2)
        level = len(indent) // 3
        while forks and forks[-1] >= level:
            forks.pop()
        if re.match(r"^forks \(\d+\)", text):
            forks.append(level)
            continue
        leaf = re.match(r"^([a-z_]+): (.*)$", text)
        label = leaf.group(1) if leaf else re.match(r"^(\S+)", text).group(1)
        rows.append({"depth": level - len(forks), "label": ROLE_LABEL if label == ROLE_FORM else label, "leaf": bool(leaf), "cursor": ln.startswith("▸")})
    return {"query": head.group(1), "at": int(head.group(2)), "of": int(head.group(3)), "rows": rows[2:]}


def main():
    bundle = bundle_arg()
    rep = Report("wave1 find")
    topo = fixture("roles.json")
    door = Door(bundle, 15, os.path.join(HERE, "fixtures", "roles.json"))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((1280, 800), (390, 844)):
                pg = browser.new_page(viewport={"width": width, "height": height})

                def to_tree():
                    pg.goto(door.url + "#/gluck/" + topo["attend"])
                    pg.wait_for_selector(".nodi-turn", timeout=10000)
                    if width < 900:
                        pg.goto(door.url + "#/")
                    pg.wait_for_selector(".fw-topology [role=treeitem]", timeout=10000)
                    pg.wait_for_timeout(500)
                    pg.locator(".fw-topology").focus()

                def find(query):
                    pg.keyboard.press("/")
                    pg.wait_for_selector(".zr-tree-find input")
                    pg.keyboard.type(query)
                    until(pg, "!!document.querySelector('.zr-tree-tally') && document.querySelector('.zr-tree-tally').textContent !== ''", 5000)

                for name in ("king", "engineer", "k-name"):
                    want = pager(name)

                    def same():
                        to_tree()
                        find(want["query"])
                        tally = pg.locator(".zr-tree-tally").text_content()
                        rep.check(tally == "%d/%d" % (want["at"], want["of"]), "%dpx /%s: tally %r, the pager says %d/%d" % (width, want["query"], tally, want["at"], want["of"]))
                        got = pg.evaluate(ROWS_JS)[2:]
                        rep.check([(r["depth"] - 2, r["label"], r["leaf"]) for r in got] == [(r["depth"] - 2, r["label"], r["leaf"]) for r in want["rows"]],
                                  "%dpx /%s: rows %s, the pager draws %s" % (width, want["query"], [(r["depth"], r["label"]) for r in got], [(r["depth"], r["label"]) for r in want["rows"]]))
                        rep.check([r["label"] for r in got if r["cursor"]] == [r["label"] for r in want["rows"] if r["cursor"]],
                                  "%dpx /%s: the cursor is on %s, the pager's is on %s" % (width, want["query"], [r["label"] for r in got if r["cursor"]], [r["label"] for r in want["rows"] if r["cursor"]]))
                        rep.check(any(r["hits"] for r in got), "%dpx /%s: no letters marked" % (width, want["query"]))
                        pg.keyboard.press("Escape")

                    rep.run("%dpx: /%s finds as the pager does" % (width, name), same)

                def none():
                    to_tree()
                    find("'idle !tmp")
                    rep.check(pg.locator(".zr-tree-tally").text_content() == "none", "%dpx: a query matching nothing says none, as the pager's 0/0" % width)
                    rep.check(pg.locator(".fw-topology [role=treeitem]").count() == 0, "%dpx: no rows for it" % width)
                    pg.keyboard.press("Escape")
                    rep.check(pg.locator(".fw-topology [role=treeitem]").count() > 2, "%dpx: Esc brings the tree back" % width)

                rep.run("%dpx: a query with no hit" % width, none)

                def steps():
                    to_tree()
                    find("king")
                    tally = lambda: pg.locator(".zr-tree-tally").text_content()
                    cursor = lambda: [r["label"] for r in pg.evaluate(ROWS_JS) if r["cursor"]]
                    rep.check(tally() == "2/5" and cursor() == ["amplifier-rocket"], "%dpx: lands on the best hit, %s %s" % (width, tally(), cursor()))
                    pg.keyboard.press("ArrowDown")
                    rep.check(tally() == "3/5" and cursor() == ["giftshop-handgun"], "%dpx: down steps to the next hit, %s %s" % (width, tally(), cursor()))
                    pg.keyboard.press("Control+n")
                    pg.keyboard.press("Control+n")
                    pg.keyboard.press("Control+n")
                    rep.check(tally() == "1/5" and cursor() == ["utopia-magazine"], "%dpx: ^N wraps after the last, %s %s" % (width, tally(), cursor()))
                    pg.keyboard.press("Control+p")
                    rep.check(tally() == "5/5", "%dpx: ^P wraps back, %s" % (width, tally()))
                    pg.keyboard.press("Enter")
                    rep.check(pg.locator(".zr-tree-find").count() == 0, "%dpx: Enter ends the find" % width)
                    rep.check(pg.evaluate("document.activeElement.getAttribute('role')") == "tree", "%dpx: the tree has the focus again" % width)
                    got = pg.evaluate(ROWS_JS)
                    rep.check([r["label"] for r in got if r["cursor"]] == [ROLE_LABEL], "%dpx: the cursor lands on the row that owns the kept hit, as the pager's, %s" % (width, [r["label"] for r in got if r["cursor"]]))
                    rep.check(not any(r["hits"] for r in got), "%dpx: the marks are gone" % width)

                rep.run("%dpx: ^N ^P step, Enter keeps the hit" % width, steps)

                def hotkeys():
                    to_tree()
                    where = lambda: [i for i, r in enumerate(pg.evaluate(ROWS_JS)) if r["cursor"]]
                    pg.keyboard.press("g")
                    pg.keyboard.press("g")
                    rep.check(where() == [0], "%dpx: gg is the first row, %s" % (width, where()))
                    pg.keyboard.press("Control+n")
                    rep.check(where() == [1], "%dpx: ^N is down, %s" % (width, where()))
                    pg.keyboard.press("Control+p")
                    rep.check(where() == [0], "%dpx: ^P is up, %s" % (width, where()))
                    pg.keyboard.press("PageDown")
                    down = where()
                    rep.check(down and down[0] > 1, "%dpx: PageDown moves half a page, %s" % (width, down))
                    pg.keyboard.press("PageUp")
                    rep.check(where() == [0], "%dpx: PageUp returns, %s" % (width, where()))
                    pg.keyboard.press("End")
                    rep.check(where() == [len(pg.evaluate(ROWS_JS)) - 1], "%dpx: End is the last row" % width)

                rep.run("%dpx: motions as the pager" % width, hotkeys)
                pg.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
