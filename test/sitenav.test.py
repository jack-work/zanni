"""sitenav in Chromium: the bar's rule and the mark are the k's gold in both
schemes, the three links are Account, Files and Figaro with their addresses,
the current one is underlined in gold and the others are not, and at 390px all
three sit on one row beside the mark."""
import os
import sys

from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(sys.argv[1])
GOLD = {"light": "rgb(162, 118, 42)", "dark": "rgb(217, 169, 78)"}
WANT = [("Account", "https://me.kelliher.info/"), ("Files", "https://files.kelliher.info/"), ("Figaro", "https://fig.kelliher.info/")]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    for scheme, gold in GOLD.items():
        pg = b.new_page(color_scheme=scheme, viewport={"width": 1280, "height": 400})
        pg.goto(PAGE)
        style = lambda sel, prop: pg.eval_on_selector(sel, f"e => getComputedStyle(e).{prop}")
        assert style(".sitenav", "borderBottomColor") == gold, (scheme, style(".sitenav", "borderBottomColor"))
        assert style(".sitenav", "borderBottomWidth") == "3px"
        assert style(".sitenav-mark b", "color") == gold, scheme
        links = pg.eval_on_selector_all(".sitenav-links a", "as => as.map(a => [a.textContent, a.href])")
        assert [tuple(l) for l in links] == WANT, links
        assert style(".sitenav-links a[aria-current]", "borderBottomColor") == gold
        assert style(".sitenav-links a:not([aria-current])", "borderBottomColor") == "rgba(0, 0, 0, 0)"
        pg.close()

    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.goto(PAGE)
    tops = pg.eval_on_selector_all(".sitenav-mark, .sitenav-links a", "es => es.map(e => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2))")
    assert max(tops) - min(tops) <= 3, ("one row at 390px", tops)
    right = pg.eval_on_selector(".sitenav-links li:last-child a", "a => a.getBoundingClientRect().right")
    assert right <= 390, right
    b.close()
print("sitenav ok")
