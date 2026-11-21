"""Bug 1, fork tracking: after a fork the web shows what the pager shows.

Pager captures: /var/tmp/wave1-capture/fork (figaro 0.80.0, tmux, isolated
daemon). Per case the pager attends the alternative, shows its own history
followed to the end (live), names it in the status bar as `<handle> · <mantra>`
with no fork glyph, and draws `⑂ <parent handle>` only on the head of the
fork's first own turn. A fork at :N keeps turns 1..N-1.
"""
from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
LANE = "c0ffee02" * 4
MAIN_TURNS = 26

FACTS_JS = """(main) => {
  const turns = [...document.querySelectorAll('.nodi-turn')].map((n) => Number(n.dataset.turn));
  const marks = [...document.querySelectorAll('.nodi-turn')].map((n) => {
    const m = n.querySelector('.nodi-turn-head .nodi-turn-fork');
    return m ? { turn: Number(n.dataset.turn), text: m.textContent.trim() } : null;
  }).filter(Boolean);
  const sc = document.querySelector('[data-zr-scroll]');
  const last = document.querySelector('.nodi-turn:last-of-type');
  const hash = location.hash;
  const aria = (hash.match(/#\\/[^/]+\\/([0-9a-f]{32})/) || [])[1] || null;
  const row = aria && document.querySelector('.fw-topology [role=treeitem][data-id="' + aria + '"]');
  const parentRow = document.querySelector('.fw-topology [role=treeitem][data-id="' + main + '"]');
  const here = [...document.querySelectorAll('.fw-topology [role=treeitem][data-here]')].map((r) => r.dataset.id).filter((id) => /^[0-9a-f]{32}$/.test(id || ''));
  return {
    hash, aria, turns, marks,
    atEnd: sc ? Math.abs(sc.scrollHeight - sc.clientHeight - sc.scrollTop) <= 2 : null,
    handle: (document.querySelector('.fw-status-handle') || {}).textContent || null,
    mantra: (document.querySelector('.fw-status-mantra') || {}).textContent || null,
    statusFork: !!document.querySelector('.fw-status-fork'),
    banner: !!document.querySelector('.fw-fork-banner'),
    forkGlyphs: (document.querySelector('#app').innerText.match(/\\u2442/g) || []).length,
    rowLevel: row ? Number(row.getAttribute('aria-level')) : null,
    parentLevel: parentRow ? Number(parentRow.getAttribute('aria-level')) : null,
    parentOpen: parentRow ? parentRow.getAttribute('aria-expanded') : null,
    here,
  };
}"""


def open_pit(pg):
    if not pg.locator(".zr-pit").count():
        pg.locator(".zr-composer .zr-grip").focus()
        pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[data-snap='half']")


def attend(pg, door, aria):
    pg.goto(door.url + "#/gluck/" + aria)
    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
    pg.wait_for_selector(".nodi-turn")
    pg.wait_for_timeout(400)


def wait_forked(pg, parent):
    until(pg, "(() => { const m = location.hash.match(/#\\/[^/]+\\/([0-9a-f]{32})/); return m && m[1] !== '%s'; })()" % parent, 8000)
    until(pg, "document.querySelector('.fw').dataset.link === 'live'", 8000)
    pg.wait_for_timeout(1200)


def common(rep, at, f, parent, parent_label, turns, mark_turn, width):
    rep.check(f["aria"] and f["aria"] != parent, "%s: the attended aria is the alternative, got %r" % (at, f["aria"]))
    rep.check(":" not in f["hash"].split("/")[-1], "%s: the route names no turn (the pager shows the fork's end), got %s" % (at, f["hash"]))
    rep.check(f["turns"] and f["turns"][-1] == turns[-1], "%s: the last turn shown is %d, got %s" % (at, turns[-1], f["turns"][-3:]))
    rep.check(max(f["turns"] or [0]) <= turns[-1], "%s: turns past the fork point are shown: %s" % (at, [t for t in f["turns"] if t > turns[-1]]))
    rep.check(f["atEnd"] is True, "%s: the transcript is followed to its end, atEnd=%r" % (at, f["atEnd"]))
    rep.check(f["handle"] and f["handle"].startswith("fork-"), "%s: the status bar names the alternative by handle, got %r" % (at, f["handle"]))
    rep.check(not f["statusFork"], "%s: the pager's status bar carries no ⑂" % at)
    rep.check(not f["banner"], "%s: the pager draws no fork banner" % at)
    if mark_turn is None:
        rep.check(f["marks"] == [] and f["forkGlyphs"] == 0, "%s: no own turn yet, so no ⑂ anywhere: marks %s, ⑂ x%d" % (at, f["marks"], f["forkGlyphs"]))
    else:
        rep.check(f["marks"] == [{"turn": mark_turn, "text": "⑂ " + parent_label}], "%s: ⑂ %s on turn %d's head only, got %s" % (at, parent_label, mark_turn, f["marks"]))
    if width >= 900:
        rep.check(f["rowLevel"] is not None and f["parentLevel"] is not None and f["rowLevel"] == f["parentLevel"] + 1, "%s: the tree puts the alternative one level under its parent: %s vs %s" % (at, f["rowLevel"], f["parentLevel"]))
        rep.check(f["parentOpen"] == "true", "%s: the parent row is open in the tree" % at)
        rep.check(f["here"] == [f["aria"]], "%s: the here mark sits on the alternative only: %s" % (at, f["here"]))


def main():
    bundle = bundle_arg()
    rep = Report("wave1 fork tracking")
    door = Door(bundle, 15)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((1280, 800), (390, 844)):
                ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
                pg = ctx.new_page()

                def tail():
                    attend(pg, door, MAIN)
                    open_pit(pg)
                    pg.locator("[data-action='tail-fork']").click()
                    wait_forked(pg, MAIN)
                    f = pg.evaluate(FACTS_JS, MAIN)
                    rep.note("tail %d: %s" % (width, {k: f[k] for k in ("hash", "atEnd", "handle", "statusFork", "banner", "marks")}))
                    common(rep, "tail fork %d" % width, f, MAIN, "zanni", list(range(1, MAIN_TURNS + 1)), None, width)

                rep.run("%dpx: tail fork (:fork)" % width, tail)

                def at_n():
                    attend(pg, door, MAIN)
                    open_pit(pg)
                    pg.locator("[data-action='fork-at']").click()
                    pg.locator(".fw-forkat-form input").fill("5")
                    pg.locator(".fw-forkat-form button[type=submit]").click()
                    wait_forked(pg, MAIN)
                    f = pg.evaluate(FACTS_JS, MAIN)
                    rep.note("at 5 %d: %s" % (width, {k: f[k] for k in ("hash", "turns", "atEnd", "handle", "statusFork", "banner", "marks")}))
                    common(rep, "fork at :5 %d" % width, f, MAIN, "zanni", [1, 2, 3, 4], None, width)

                rep.run("%dpx: fork at N (:fork :5)" % width, at_n)

                def at_n_prompt():
                    attend(pg, door, MAIN)
                    open_pit(pg)
                    pg.locator("[data-action='fork-at']").click()
                    pg.locator(".fw-forkat-form input").fill("5")
                    pg.locator(".fw-forkat-form textarea").fill("what if we waited")
                    pg.locator(".fw-forkat-form button[type=submit]").click()
                    wait_forked(pg, MAIN)
                    until(pg, "document.querySelector('.nodi-turn[data-turn=\"5\"]') !== null", 8000)
                    pg.wait_for_timeout(1500)
                    f = pg.evaluate(FACTS_JS, MAIN)
                    rep.note("at 5 + prompt %d: %s" % (width, {k: f[k] for k in ("hash", "turns", "atEnd", "marks")}))
                    common(rep, "fork at :5 with a prompt %d" % width, f, MAIN, "zanni", [1, 2, 3, 4, 5], 5, width)
                    sent = door.state()["sent"]
                    rep.check(any(s["text"] == "what if we waited" and s["id"] == f["aria"] for s in sent), "the prompt went to the alternative: %s" % sent)

                rep.run("%dpx: fork at N with a prompt (:fork :5 -- text)" % width, at_n_prompt)

                def other():
                    attend(pg, door, MAIN)
                    pg.locator(".zr-command").click(timeout=3000)
                    pg.locator(".zr-input").fill("fork " + LANE)
                    pg.keyboard.press("Enter")
                    wait_forked(pg, MAIN)
                    f = pg.evaluate(FACTS_JS, LANE)
                    rep.check(f["aria"] not in (MAIN, LANE), "fork of another: the alternative is attended, got %r" % f["aria"])
                    rep.check(f["turns"] and f["turns"][-1] == 4, "fork of another: the lane's history (4 turns) is shown: %s" % f["turns"])
                    if width >= 900:
                        rep.check(f["rowLevel"] == (f["parentLevel"] or -9) + 1, "fork of another: the alternative sits under the lane in the tree")

                rep.run("%dpx: fork of another aria (:fork <id>)" % width, other)
                ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
