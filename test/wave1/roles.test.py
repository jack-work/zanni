"""The tree's order and role rows as the pager's :ls draws them.

fixtures/pager-tree/roles-ls.txt is a tmux capture of figaro 365fa68c9's :ls
(@arias rows carry `recency`, a role row takes its holder's) on an isolated
daemon; roles-recency.json is that daemon's @troupe and @arias. The web serves
the same forms, attends the same aria, and must draw the same rows: the role
row between the newest aria and the older ones, as `@name (n)  -> holder`, its
holder under it.
"""
import os
import re

from kit import Door, Report, bundle_arg, fixture

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))

ROWS_JS = """() => [...document.querySelectorAll('.fw-topology [role=treeitem]')].map((r) => {
  const text = (s) => { const e = r.querySelector(s); return e ? e.textContent.trim() : ''; };
  return { depth: Number(r.getAttribute('aria-level')) - 1, label: text('.zr-tree-label'), count: text('.zr-tree-count').replace(/[() ]/g, ''), arrow: text('.zr-tree-role').startsWith('\\u2192') ? text('.zr-tree-role') : '', here: r.hasAttribute('data-here'), cursor: r.hasAttribute('data-cursor') };
})"""


def open_tree(pg):
    if pg.locator(".fw-topology [role=treeitem]").count():
        return
    if not pg.locator(".zr-pit[data-snap='half'], .zr-pit[data-snap='full']").count():
        pg.locator(".zr-pit-knob").focus()
        pg.keyboard.press("Enter")
        pg.wait_for_selector(".zr-pit[data-snap='half']")
    pg.locator(".zr-pit-row[data-action='tree']").click()
    pg.wait_for_selector(".fw-topology [role=treeitem]", timeout=10000)


def pager():
    rows = []
    with open(os.path.join(HERE, "fixtures", "pager-tree", "roles-ls.txt")) as fh:
        for ln in fh:
            ln = ln.rstrip("\n")
            if ln.startswith("▸") or ln.startswith(" "):
                m = re.match(r"^((?:[│ ]  |├─ |└─ )*)(.+?) \((\d+)\)(.*)$", ln[2:])
                if not m:
                    continue
                arrow = re.search(r"→ \S+", m.group(4))
                rows.append({"depth": len(m.group(1)) // 3, "label": m.group(2), "count": m.group(3), "arrow": arrow.group(0) if arrow else "", "here": "●" in m.group(4), "cursor": ln.startswith("▸")})
    return rows


def main():
    bundle = bundle_arg()
    rep = Report("wave1 roles")
    topo = fixture("roles-recency.json")
    want = pager()
    door = Door(bundle, 15, os.path.join(HERE, "fixtures", "roles-recency.json"))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((1280, 800), (390, 844)):
                pg = browser.new_page(viewport={"width": width, "height": height})

                def same():
                    pg.goto(door.url + "#/gluck/" + topo["attend"])
                    pg.wait_for_selector(".nodi-turn", timeout=10000)
                    open_tree(pg)
                    pg.wait_for_timeout(500)
                    got = pg.evaluate(ROWS_JS)
                    rep.check(len(got) == len(want), "%dpx: %d rows, the pager draws %d: %s" % (width, len(got), len(want), [g["label"] for g in got]))
                    for i, (w, g) in enumerate(zip(want, got)):
                        if i < 2 and width >= 0:
                            rep.check(g["depth"] == w["depth"], "%dpx row %d depth %r, want %r" % (width, i, g["depth"], w["depth"]))
                            continue
                        for k in ("depth", "label", "count", "arrow", "here", "cursor"):
                            rep.check(g[k] == w[k], "%dpx row %d (%s): %s %r, the pager has %r" % (width, i, w["label"], k, g[k], w[k]))

                rep.run("%dpx: the role row rises with its holder, as the pager's :ls" % width, same)
                pg.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
