import base64
import html
import json
import os

here = os.path.dirname(os.path.abspath(__file__))
faces = json.load(open(f"{here}/faces.json"))
titles = json.load(open(f"{here}/titles.json"))
static = json.load(open(f"{here}/static.json"))
metrics = json.load(open(f"{here}/metrics.json"))
notes = json.load(open(f"{here}/notes.json"))
ebg = {"id": "ebg", "name": "EB Garamond", "family": "EB Garamond", "file": "fonts/eb-garamond.woff2"}
by_id = {f["id"]: f for f in faces}
base = faces[0]
cands = faces[1:]
NOMINAL = [16, 20, 28]
SLOTS = {"title": 19, "mark": 26}


def mrow(fid, size):
    for r in metrics:
        if r["id"] == fid and r["size"] == size:
            return r
    return None


def data_uri(path):
    return "data:font/woff2;base64," + base64.b64encode(open(f"{here}/{path}", "rb").read()).decode()


def font_css():
    out = []
    for f in faces + [ebg]:
        out.append(f"@font-face{{font-family:'{f['family']}';src:url({data_uri(f['file'])}) format('woff2');font-weight:400;font-style:normal;font-display:block}}")
    return "\n".join(out)


def snapped_size(f, slot_x):
    n = f["native"]
    xr = static[f["id"]]["x_rows"]
    options = [k * n for k in (1, 2, 3) if k * n <= 44]
    if not options:
        return None
    return min(options, key=lambda s: (abs(xr * s / n - slot_x), s))


def px_per_cell(f, size):
    return size / f["native"]


def span(f, size, text):
    return f"<span class=\"t\" style=\"font-family:'{f['family']}';font-size:{size}px\">{html.escape(text)}</span>"


def chip(f, size):
    r = mrow(f["id"], size)
    xh = f"x {r['xh']}px" if r else ""
    return f"{xh} · {px_per_cell(f, size):.2f} px/cell"


def compare(ground, cand, cols):
    head = "".join(f"<div class=\"h\">{html.escape(c['head'])}</div>" for c in cols)
    rows = []
    for t in titles:
        rows.append(f"<div class=\"lab\">{html.escape(base['id'].upper())}</div>" + "".join(f"<div>{span(base, c['base'], t)}</div>" for c in cols))
        rows.append(f"<div class=\"lab c\">{html.escape(cand['id'].upper())}</div>" + "".join(f"<div>{span(cand, c['cand'], t)}</div>" for c in cols) )
        rows.append("<div class=\"sep\"></div>")
    return f"<div class=\"pane {ground}\"><div class=\"cmp\" style=\"grid-template-columns:44px repeat({len(cols)},max-content)\"><div></div>{head}{''.join(rows)}</div></div>"


def glance_rows(group):
    rows = []
    for f in [base] + cands:
        if group == "A":
            st, sm = SLOTS["title"], SLOTS["mark"]
        else:
            if f is base:
                st, sm = SLOTS["title"], SLOTS["mark"]
            else:
                xt = mrow("j24", SLOTS["title"])["xh"]
                xm = mrow("j24", SLOTS["mark"])["xh"]
                st, sm = snapped_size(f, xt), snapped_size(f, xm)
                if st is None:
                    rows.append((f, None, None))
                    continue
        rows.append((f, st, sm))
    return rows


def glance_pane(ground, group):
    out = []
    for f, st, sm in glance_rows(group):
        cur = " cur" if f is base else ""
        if st is None:
            out.append(f"<div class=\"g{cur}\"><div class=\"gl\"><b>{html.escape(f['name'])}</b><i>grid too fine to snap below 44px</i></div><div class=\"gm\"></div><div class=\"gt\"></div></div>")
            continue
        sub = f"mark {sm}px, title {st}px · {px_per_cell(f, st):.2f} px/cell"
        out.append(f"<div class=\"g{cur}\"><div class=\"gl\"><b>{html.escape(f['name'])}</b><i>{sub}</i></div><div class=\"gm\">{span(f, sm, 'Scope')}</div><div class=\"gt\">{span(f, st, 'Time to first token, by layer')}<br>{span(f, st, 'List-price equivalent')}</div></div>")
    return f"<div class=\"pane {ground} glance\">{''.join(out)}</div>"


def yesno(a):
    have, total, missing = a
    return f"{have}/{total}"


def facts(f):
    s = static[f["id"]]
    miss = s["cockpit_missing"].replace("→", "")
    rows = [
        ("designer", f["designer"]),
        ("licence", f["license"]),
        ("source", f"<a href=\"{f['source']}\">{html.escape(f['source'])}</a>"),
        ("pixel grid", f"{s['grid_em']:g} cells per em; x-height {s['x_rows']:g} rows, caps {s['cap_rows']:g}, descender {s['desc_rows']:g}"),
        ("native sizes", f"{f['native']}px (1 cell = 1 CSS px), {2 * f['native']}px (2 px)"),
        ("coverage", f"letters {yesno(s['letters'])}, digits {yesno(s['digits'])}, ASCII punctuation {yesno(s['punct'])}, Latin-1/Ext accents {yesno(s['accents'])}"),
        ("cockpit gaps", html.escape(miss) if miss else "none"),
    ]
    return "<dl>" + "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in rows) + "</dl>"


def section(f):
    xt = mrow("j24", SLOTS["title"])["xh"]
    xm = mrow("j24", SLOTS["mark"])["xh"]
    st, sm = snapped_size(f, xt), snapped_size(f, xm)
    nominal_cols = [{"head": f"{s}px", "base": s, "cand": s} for s in NOMINAL]
    if st is None:
        snap_cols = []
    else:
        snap_cols = [{"head": f"J24 {SLOTS['title']}px / {f['id'].upper()} {st}px (title slot)", "base": SLOTS["title"], "cand": st}]
        if sm != st:
            snap_cols.append({"head": f"J24 {SLOTS['mark']}px / {f['id'].upper()} {sm}px (mark slot)", "base": SLOTS["mark"], "cand": sm})
        k2 = [s for s in (2 * f["native"],) if s <= 44 and s not in (st, sm)]
        for s in k2:
            snap_cols.append({"head": f"J24 {SLOTS['mark']}px / {f['id'].upper()} {s}px (2x grid)", "base": SLOTS["mark"], "cand": s})
    body = f"<section id=\"{f['id']}\"><h2>{html.escape(f['name'])}</h2><p class=\"note\">{notes.get(f['id'], '')}</p>{facts(f)}"
    body += "<h3>Drop-in: same font-size as Jacquard 24 (16, 20, 28 px)</h3>"
    body += compare("light", f, nominal_cols) + compare("dark", f, nominal_cols)
    if snap_cols:
        body += "<h3>On its pixel grid (integer px per cell), against Jacquard 24 at the cockpit slots</h3>"
        body += compare("light", f, snap_cols) + compare("dark", f, snap_cols)
    else:
        body += "<p class=\"note\">No snapped block: one cell is already 1 px at 50 px, so every size from 16 to 44 px falls between grid steps.</p>"
    return body + "</section>"


def table(headers, rows, cls=""):
    th = "".join(f"<th>{h}</th>" for h in headers)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table class=\"{cls}\"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>"


def md_table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def tables():
    xt = mrow("j24", SLOTS["title"])["xh"]
    xm = mrow("j24", SLOTS["mark"])["xh"]
    out = []
    t1 = []
    for f in faces:
        s = static[f["id"]]
        t1.append([f["name"], f"{s['grid_em']:g}", f"{s['x_rows']:g} / {s['asc_rows']:g} / {s['cap_rows']:g} / {s['desc_rows']:g}", f"{s['asc_rows'] / s['x_rows']:.2f}", f"{s['x_ratio']:.2f}"] + [f"{px_per_cell(f, z):.2f}" for z in (16, 19, 20, 26, 28)])
    out.append(("Grid and proportions", ["face", "cells per em", "rows: x / asc / cap / desc", "asc/x", "x/em", "px per cell at 16", "19", "20", "26", "28"], t1,
                "CSS pixels per font cell at each size. 1.00 or 2.00 is a crisp grid; anything below 1 is sub-pixel and every edge is anti-aliased. On a 2x display double the figure."))
    t2 = []
    for f in faces:
        r19, r26 = mrow(f["id"], 19), mrow(f["id"], 26)
        st = snapped_size(f, xt) if f is not base else SLOTS["title"]
        rs = mrow(f["id"], st) if st else None
        def cn(r):
            return "".join(ch if r["counters"][ch] else "-" for ch in "eao")
        t2.append([f["name"], f"{r19['xh']} / {r19['cap']}", f"{r19['soft'] * 100:.0f}%", cn(r19), f"{r26['xh']} / {r26['cap']}", f"{r26['soft'] * 100:.0f}%", cn(r26),
                   (f"{st}px: {rs['xh']} / {rs['cap']}, {rs['soft'] * 100:.0f}%, {cn(rs)}" + (" (current)" if f is base else "") if rs else "none")])
    out.append(("Rendered at the cockpit sizes (1x) and snapped", ["face", "19px x / cap", "soft edges", "counters e a o", "26px x / cap", "soft edges", "counters e a o", "snapped title size: x / cap, soft, counters"], t2,
                "Headless Chromium, device pixel ratio 1. Soft edges: share of inked pixels that are neither solid nor empty. A dash in the counters column means that counter has closed (no enclosed background pixel at 50% coverage)."))
    keys = [("ce", "c/e"), ("nu", "n/u"), ("nr", "n/r"), ("fs", "f/s"), ("tl", "t/l"), ("il", "i/l"), ("IL", "I/L"), ("SE", "S/E")]
    t3 = []
    for f in faces + [ebg]:
        st = (snapped_size(f, xt) if f is not base else SLOTS["title"]) if f["id"] != "ebg" else 20
        st = st or 19
        r = mrow(f["id"], st)
        vals = [r["pairs"][k] for k, _ in keys]
        t3.append([f["name"], st] + [f"{v:.2f}" for v in vals] + [f"{min(vals):.2f}"])
    out.append(("Letter distinctness", ["face", "size"] + [lab for _, lab in keys] + ["lowest"], t3,
                "Normalised pixel difference between two glyphs rendered at that size, best horizontal alignment: 0 is identical, 1 is no overlap. Higher is easier to tell apart. It barely moves with size, so it measures the design. EB Garamond row for scale."))
    t4 = []
    dens_e = sum(r["density"] for r in metrics if r["id"] == "ebg") / len([r for r in metrics if r["id"] == "ebg"])
    for f in faces:
        rows = [r for r in metrics if r["id"] == f["id"]]
        d = sum(r["density"] for r in rows) / len(rows)
        nat = mrow(f["id"], f["native"]) or mrow(f["id"], 43)
        t4.append([f["name"], f"{d:.2f}", f"{d / dens_e:.2f}", f"{nat['stem']}/{nat['xh']} = {nat['stem'] / nat['xh']:.2f}"])
    r28 = mrow("ebg", 28)
    t4.append(["EB Garamond (body)", f"{dens_e:.2f}", "1.00", f"{r28['stem']}/{r28['xh']} = {r28['stem'] / r28['xh']:.2f} (at 28px)"])
    out.append(("Weight against the body face", ["face", "ink per x-band pixel", "x EB Garamond", "stem / x-height at native size"], t4,
                "Mean alpha over the x-height band of the eight titles. Display faces sit 1.3 to 1.4 times heavier than Garamond body; Jacquarda Bastarda 9 is the only one that matches it."))
    t5 = []
    for f in faces:
        s = static[f["id"]]
        t5.append([f["name"], yesno(s["letters"]), yesno(s["digits"]), yesno(s["punct"]), yesno(s["accents"]), yesno(s["typo"]), s["cockpit_missing"].replace("→", "") or "none", f"{s['cmap']}", f"{s['pack_file_bytes'] // 1024} KB"])
    out.append(("Coverage", ["face", "A-Z a-z", "0-9", "ASCII punct (of 32)", "accented Latin (of 60)", "typographic (of 16)", "cockpit title chars missing", "codepoints", "woff2 as shipped"], t5,
                "Cockpit set: the eight titles plus digits and . % $ : , - ( ) # + / and the arrow. Jacquard 24 as shipped in the fontpack is a subset (218 glyphs); the full font is 331 codepoints."))
    return out


def numbers():
    return "".join(f"<h3>{t}</h3>{table(h, r, 'num')}<p class=\"cap\">{c}</p>" for t, h, r, c in tables())


def tables_md():
    return "\n\n".join(f"### {t}\n\n{md_table(h, r)}\n\n{c}" for t, h, r, c in tables())


CSS = """
*{box-sizing:border-box}
html{background:#f1ebe2;color:#2b1a15}
body{margin:0 auto;max-width:1400px;padding:28px 32px 80px;font:17px/1.5 'EB Garamond',Georgia,serif}
h1{font:600 30px/1.2 'EB Garamond',serif;margin:0 0 6px}
h2{font:600 24px/1.2 'EB Garamond',serif;margin:46px 0 6px;padding-top:18px;border-top:1px solid #cdb39f}
h3{font:600 16px/1.3 'EB Garamond',serif;margin:22px 0 8px;color:#6b4a3d;text-transform:uppercase;letter-spacing:.06em}
p{max-width:84ch;margin:6px 0}
a{color:#7d2e2e}
nav{margin:14px 0 4px;font-size:16px}
nav a{margin-right:14px}
.note{color:#4a3027}
.cap{font-size:14px;color:#6b4a3d;margin:4px 0 18px}
dl{display:grid;grid-template-columns:110px 1fr;gap:2px 14px;margin:10px 0 4px;font-size:15px}
dt{color:#6b4a3d}dd{margin:0}
.pane{border:1px solid #cdb39f;padding:14px 18px;margin:10px 0;overflow-x:auto}
.pane.light{background:#e7d4c4;--ink:#7d2e2e;--mut:#6b4a3d;--rule:#cdb39f;--hi:#2b1a15}
.pane.dark{background:#1a0d0f;--ink:#d9a94e;--mut:#a5887b;--rule:#3b2620;--hi:#f0dfc8}
.pane{color:var(--ink);border-color:var(--rule)}
.t{font-weight:400;font-synthesis:none;white-space:nowrap;line-height:1.25;color:var(--ink)}
.cmp{display:grid;column-gap:44px;row-gap:0;align-items:baseline}
.cmp .h{font:13px/1.3 ui-monospace,monospace;color:var(--mut);padding-bottom:6px;white-space:nowrap}
.cmp .lab{font:12px ui-monospace,monospace;color:var(--mut)}
.cmp .lab.c{color:var(--hi)}
.cmp .sep{grid-column:1 / -1;border-bottom:1px solid var(--rule);height:4px;margin-bottom:4px}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.glance{padding:10px 16px}
.g{display:grid;grid-template-columns:96px 1fr;gap:2px 14px;align-items:center;padding:7px 0;border-bottom:1px solid var(--rule)}
.g .gl{grid-column:1 / -1;display:flex;gap:12px;align-items:baseline}
.g:last-child{border-bottom:0}
.g.cur{opacity:.9}
.gl b{display:block;font:600 14px 'EB Garamond',serif;color:var(--hi)}
.gl i{display:block;font:12px ui-monospace,monospace;color:var(--mut);font-style:normal}
.gt .t{display:block}
table.num{border-collapse:collapse;font-size:15px;margin:10px 0 0}
table.num th,table.num td{border-bottom:1px solid #cdb39f;padding:4px 14px 4px 0;text-align:left;font-variant-numeric:tabular-nums}
table.num th{font-weight:600;color:#6b4a3d}
.lead{font-size:19px}
"""


def page():
    nav = "".join(f"<a href=\"#{f['id']}\">{html.escape(f['name'])}</a>" for f in cands)
    glance = (
        "<section id=\"glance\"><h2>At a glance</h2>"
        "<h3>A. Drop-in: swap the family, keep the cockpit sizes (title 19px, mark 26px)</h3>"
        f"<div class=\"duo\">{glance_pane('light', 'A')}{glance_pane('dark', 'A')}</div>"
        "<h3>B. Snapped: integer pixels per font cell, nearest to Jacquard 24's x-height at each slot</h3>"
        f"<div class=\"duo\">{glance_pane('light', 'B')}{glance_pane('dark', 'B')}</div></section>"
    )
    head = (
        "<h1>Gothic display face study</h1>"
        "<p class=\"lead\"><b>Recommendation: Jacquard 12 at 21px for panel titles. Fallback: Not Jam Blackletter 13 at 13px.</b> Reasons and measurements are in the report beside this file.</p>"
        "<p class=\"lead\">Scope cockpit panel titles, currently Jacquard 24. Candidates are pixel or pixel-adjacent blackletters that can be self-hosted as woff2. Colours are the cockpit tokens: ground #E7D4C4 with accent-ink #7D2E2E, and velvet #1A0D0F with #D9A94E. Rendered by headless Chromium at 1x; the fonts are embedded in this file.</p>"
        f"<nav><a href=\"#glance\">At a glance</a>{nav}<a href=\"#numbers\">Numbers</a></nav>"
    )
    secs = "".join(section(f) for f in cands)
    nums = f"<section id=\"numbers\"><h2>Numbers</h2>{numbers()}</section>"
    return f"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Gothic display face study</title><style>{font_css()}{CSS}</style></head><body>{head}{glance}{secs}{nums}</body></html>"


open(f"{here}/specimen.html", "w").write(page())
open(f"{here}/tables.md", "w").write(tables_md())
print(os.path.getsize(f"{here}/specimen.html"))
