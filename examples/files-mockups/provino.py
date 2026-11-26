import os

from lib import (BATCH_DAY, FILES_SCREENS, UPLOAD_SCREENS, from_note, ic, mbtext, page, read, scenario, totals)

HERE = os.path.dirname(os.path.abspath(__file__))
SIGNED_IN = "wren"

SRC = {
    "immich": ("Immich v3", "immich", None),
    "coss": ("coss.com origin file upload", "coss", None),
    "uppy": ("Uppy Dashboard", "uppy", None),
    "ios": ("iOS 26 Photos", "ios26", None),
    "gphotos": ("Google Photos 2026", "gphotos", None),
    "ente": ("Ente upload card", "ente", None),
    "untitled": ("Untitled UI file queue", "untitledui", None),
    "nuxt": ("Nuxt UI FileUpload", "nuxtui", None),
    "retro": ("Setproduct retro UI 2026", "retro", None),
    "twentyfirst": ("21st.dev upload components", "twentyfirst", None),
}


def src(*pairs):
    return from_note([(SRC[k][0], SRC[k][1], t) for k, t in pairs])


def mast(right):
    return f'<header class="p-mast"><a class="p-mark" href="#u-ready">files</a>{right}</header>'


def tile(f, heic=False):
    st, i = f["state"], f["scene"]
    p = f["frac"]
    tags = ""
    if f["kind"] == "video":
        tags = f'<span class="tag">{ic("play", px=2)}{f["dur"]}</span>'
    h = '<span class="heic">HEIC</span>' if heic and f["kind"] == "heic" else ""
    if st == "done":
        return f'<div class="p-tile done"><div class="tn t{i}"></div>{h}{tags}</div>'
    if st == "waiting":
        return f'<div class="p-tile waiting"><div class="px pxl p{i}"></div>{tags}</div>'
    if st == "sending":
        pct = f'<span class="tag" style="left:auto;right:4px">{round(p * 100)}%</span>'
        return (f'<div class="p-tile sending"><div class="px pxl p{i}"></div><div class="fx tn t{i}" style="--p:{p:.2f}"></div>'
                f'<div class="edge" style="--p:{p:.2f}"></div>{pct}{tags}</div>')
    if st in ("paused", "resuming"):
        icon = "pause" if st == "paused" else "glass"
        return (f'<div class="p-tile {st}"><div class="px pxl p{i}"></div><div class="fx tn t{i}" style="--p:{p:.2f}"></div>'
                f'<div class="veil">{ic(icon)}</div>{tags}</div>')
    if st == "failed":
        return (f'<div class="p-tile failed"><a href="#u-sending"><div class="px pxl p{i}"></div><div class="fx tn t{i}" style="--p:{p:.2f}"></div>'
                f'<div class="veil">{ic("warn")}</div><span class="cap">Tap to retry</span></a></div>')
    if st == "refused":
        return (f'<div class="p-tile refused"><div class="veil">{ic("close")}</div><span class="cap">{f["ext"]} not allowed</span></div>')
    if st == "memo":
        half = " half" if f["note"] == "part-way" else ""
        return f'<div class="p-tile ghost{half}"><div class="nm">{f["name"].replace(".", "<br>.")}</div></div>'
    return ""


def up_screen(sid, name):
    fs, _ = scenario(name)
    t = totals(fs)
    n = len(fs)
    default = " default" if name == "ready" else ""
    open_ = f'<section class="screen p-up{default}" id="{sid}">{mast(f"<span class=p-ident>{SIGNED_IN}</span>")}<div class="p-wrap">'
    close = "</div>"
    if name == "ready":
        empties = "".join('<div class="p-tile empty"></div>' for _ in range(12))
        side = (f'<div class="p-side"><div class="p-title"><h1>Upload</h1><p>Pick photos and videos. They appear as frames and develop as they send.</p></div></div>')
        grid = (f'<div class="p-sheetwrap"><div class="p-grid">{empties}</div><div class="p-cta"><a href="#u-sending">{ic("up")}Choose photos and videos'
                f'<small>Into your folder, uploads / {BATCH_DAY}</small></a></div></div>')
        facts = (f'<div class="p-facts"><div class="p-fact">{ic("sun")}<b>Awake</b>The screen stays on while files send.</div>'
                 f'<div class="p-fact">{ic("lock")}<b>Locked?</b>Open this page again. It carries on.</div>'
                 f'<div class="p-fact">{ic("photo")}<b>HEIC</b>iPhone photos are saved as they are.</div></div>')
        notes = src(("coss", "frames that fill the page instead of a list"), ("uppy", "small copies made on the device by a thumbnail generator"),
                    ("ios", "the grid is the home screen"), ("retro", "dotted frames, pixel icons"))
        return open_ + side.replace("</div></div>", "</div></div>") + f'<div>{grid}{facts}</div>' + close + notes + "</section>"
    tiles_ = "".join(tile(f, heic=name == "done") for f in fs)
    strip = ""
    dock = ""
    sub = ""
    meter = "live"
    lab = "saved"
    if name == "sending":
        sub = f'<b>{mbtext(t["done"])} of {mbtext(t["total"])}</b> · about {t["left_min"]} min · screen stays on'
        dock = f'<a class="p-btn" href="#u-paused">{ic("pause", px=3)} Pause</a><a class="p-btn ghost" href="#u-sending">{ic("plus", px=3)} Add</a>'
    elif name == "paused":
        sub = '<b>On hold.</b> Finished parts are kept'
        meter = "hold"
        lab = "saved, paused"
        dock = f'<a class="p-btn" href="#u-sending">{ic("play", px=3)} Resume</a><a class="p-btn ghost" href="#u-sending">{ic("plus", px=3)} Add</a>'
    elif name == "away":
        sub = f'<b>{mbtext(t["done"])} of {mbtext(t["total"])}</b> · about {t["left_min"]} min · screen stays on'
        strip = (f'<div class="p-strip">{ic("lock")}<div><b>Welcome back.</b> The screen was off from 12:41 to 12:47. '
                 f'Each file carries on from its last saved part.</div></div>')
        dock = f'<a class="p-btn" href="#u-paused">{ic("pause", px=3)} Pause</a>'
    elif name == "reload":
        sub = f'<b>{n - t["n"]} to go.</b> The phone closed this page'
        meter = "hold"
        strip = (f'<div class="p-strip warn">{ic("warn")}<div><b>Nothing is lost.</b> Choose the same photos again. '
                 f'Saved ones are skipped, dashed frames fill in as they match.</div></div>')
        dock = f'<a class="p-btn" href="#u-away">{ic("up", px=3)} Choose them again</a>'
    elif name == "problem":
        bad = sum(1 for f in fs if f["state"] in ("failed", "refused"))
        sub = f'<b>{bad} need you.</b> 2 stopped, 1 not allowed'
        meter = "fail"
        strip = (f'<div class="p-strip warn">{ic("warn")}<div><b>IMG_4030.MOV stopped at part 112 of 194.</b> '
                 f'Retry picks up from there. Dancing.gif can\'t be uploaded here.</div></div>')
        dock = f'<a class="p-btn" href="#u-sending">Retry 2 stopped</a>'
    elif name == "done":
        sub = f'<b>{mbtext(t["total"])}</b> in uploads / {BATCH_DAY}'
        meter = "ok"
        lab = "all saved"
        heic = sum(1 for f in fs if f["kind"] == "heic")
        strip = (f'<div class="p-done-note"><span class="c">HEIC</span><div><b>{heic} iPhone photos are saved as they are.</b> '
                 f'A 1600 px JPEG copy sits beside each, so every device can show them.</div></div>')
        dock = f'<a class="p-btn" href="#f-folder">Open your folder</a><a class="p-btn ghost" href="#u-ready">More</a>'
    count = (f'<div class="p-count"><span class="n">{t["n"]}</span><span class="of">/ {n}</span><span class="lab">{lab}</span></div>'
             f'<div class="p-meter {meter}" style="--p:{t["pct"]:.2f}"><span></span></div><div class="p-sub">{sub}</div>')
    if name == "problem":
        count = count.replace(f'--p:{t["pct"]:.2f}', f'--p:{t["n"] / n:.2f}')
    side = f'<div class="p-side"><div class="p-lead">{count}</div>{strip if name != "done" else ""}<div class="p-dock">{dock}</div></div>'
    body = f'<div><div class="p-grid">{tiles_}</div>{strip if name == "done" else ""}</div>'
    notes = {"sending": src(("coss", "uploaded files header with an Add more button, tiles you can read at a glance"),
                            ("immich", "the screen is kept awake while uploading (v3.1.0)"), ("uppy", "one overall bar, pause and resume")),
             "paused": src(("uppy", "pause and resume are one button"), ("untitled", "a held file is dimmed, not red")),
             "away": src(("ente", "pick the same files again, finished ones are skipped"), ("immich", "wake lock needs HTTPS, so the page asks for it on every start")),
             "reload": src(("ente", "stop, then select the same files again: completed files stay and are skipped"), ("coss", "blank frames for the missing files")),
             "problem": src(("untitled", "failed items stand apart with a plain retry"), ("coss", "tiles can carry a state badge")),
             "done": src(("twentyfirst", "the after state: what the uploaded set looks like"), ("ente", "completion dialog says what happened and what is left"))}[name]
    return open_ + side + body + close + notes + "</section>"


def crumbs(items):
    out = []
    for i, (label, href) in enumerate(items):
        if i:
            out.append('<span class="sep">/</span>')
        out.append(f'<a href="{href}">{label}</a>' if href else f'<span class="here">{label}</span>')
    return f'<nav class="p-crumbs" aria-label="Where you are">{"".join(out)}</nav>'


def ftile(scene, kind, href, dur="", name=""):
    if kind == "pdf":
        return f'<div class="p-tile pdf"><a href="{href}"><div style="position:static;display:grid;justify-items:center;gap:6px;padding:6px">{ic("pdf", px=4)}<span>{name}</span></div></a></div>'
    tag = f'<span class="tag">{ic("play", px=2)}{dur}</span>' if kind == "video" else ""
    h = '<span class="heic">HEIC</span>' if kind == "heic" else ""
    return f'<div class="p-tile"><a href="{href}"><div class="tn t{scene}"></div>{h}{tag}</a></div>'


HREF = {"photo": "#f-photo", "heic": "#f-heic", "video": "#f-video", "pdf": "#f-pdf"}
DAY1 = [(2, "photo", ""), (9, "heic", ""), (5, "photo", ""), (3, "video", "0:41"), (1, "photo", ""), (4, "heic", ""), (7, "photo", ""),
        (0, "pdf", "Recipe cards.pdf"), (10, "photo", ""), (6, "video", "2:08"), (11, "photo", ""), (8, "photo", "")]
DAY2 = [(1, "photo", ""), (5, "photo", ""), (9, "photo", ""), (2, "heic", ""), (3, "photo", ""), (7, "photo", "")]
DAY3 = [(4, "photo", ""), (6, "photo", ""), (10, "video", "0:19"), (8, "photo", ""), (0, "photo", "")]


def day(label, count, items, show_more=False):
    tiles_ = "".join(ftile(s, k, HREF[k], d, d if k == "pdf" else "") if k != "pdf" else ftile(s, k, HREF[k], "", d) for s, k, d in items)
    more = f'<div class="p-more"><a href="#f-folder">Show all {count} {ic("next", px=2)}</a></div>' if show_more else ""
    return f'<div class="p-day">{label}<span>{count} files</span></div><div class="p-grid">{tiles_}</div>{more}'


FAB = f'<a class="p-btn p-fab" href="#u-ready">{ic("plus", px=3)} Upload</a>'


def files_screen(sid):
    up = f'<a class="p-icobtn" href="#u-ready">{ic("up", px=2)} Upload</a>'
    if sid == "f-root":
        cards = (f'<a class="p-card" href="#f-folder"><div class="mos"><i class="tn t2"></i><i class="tn t9"></i><i class="tn t5"></i><i class="tn t3"></i></div>'
                 f'<div class="cap"><b>uploads</b><span>68 files · 3 days</span></div></a>'
                 f'<a class="p-card" href="#f-pdf"><div class="mos doc">{ic("pdf", px=8)}</div><div class="cap"><b>Documents</b><span>2 files</span></div></a>')
        inner = (f'{crumbs([("Your files", None)])}<div class="p-title"><h1>Your files</h1></div>'
                 f'<p class="p-privacy">Only you can see these.</p><div class="p-cards">{cards}</div>')
        notes = src(("gphotos", "collections as cards with a cover, newest first"), ("ios", "the library and the collections are separate places"))
        return f'<section class="screen p-files" id="{sid}">{mast(up)}<main class="p-wrap">{inner}</main>{FAB}{notes}</section>'
    if sid == "f-folder":
        rail = '<div class="p-rail"><span class="on">24 Nov</span><span>9 Nov</span><span>18 Oct</span></div>'
        inner = (f'{crumbs([("Your files", "#f-root"), ("uploads", None)])}<div class="p-title"><h1>Uploads</h1><p>68 files, newest first</p></div>'
                 f'{day("Tue 24 Nov", 41, DAY1, True)}{day("Mon 9 Nov", 22, DAY2)}{day("Sun 18 Oct", 5, DAY3)}')
        notes = src(("immich", "a timeline under date headings, tiles edge to edge, a date rail on wide screens"),
                    ("gphotos", "persistent floating controls"), ("ios", "Upload sits at the bottom where the thumb is"))
        return f'<section class="screen p-files" id="{sid}">{mast(up)}<main class="p-wrap">{inner}{rail}</main>{FAB}{notes}</section>'
    if sid == "f-empty":
        empties = "".join('<div class="p-tile empty"></div>' for _ in range(9))
        inner = (f'{crumbs([("Your files", None)])}<div class="p-title"><h1>Your files</h1><p>Nothing here yet.</p></div>'
                 f'<div class="p-sheetwrap"><div class="p-grid">{empties}</div><div class="p-cta"><a href="#u-ready">{ic("up")}Upload your first photos<small>They show up here as soon as they are saved.</small></a></div></div>')
        notes = src(("immich", "the empty library is the same grid with frames"), ("twentyfirst", "an empty state names the next action"))
        return f'<section class="screen p-files" id="{sid}">{mast(up)}<main class="p-wrap">{inner}</main>{notes}</section>'
    top_back = f'<a href="#f-folder" aria-label="Back to uploads">{ic("prev", px=3)}</a>'
    dl = f'<a class="dl" href="#{sid}">{ic("down", px=2)} Download</a>'
    if sid in ("f-photo", "f-heic"):
        heic = sid == "f-heic"
        stage = (f'<div class="p-stage"><a class="arrow l" href="#{sid}">{ic("prev", px=4)}</a><div class="img tn {"b9" if heic else "b5"}"></div><a class="arrow r" href="#{sid}">{ic("next", px=4)}</a></div>')
        note = (f'<div class="note"><b>HEIC original.</b> This is the 1600 px JPEG copy, so it shows on every device. '
                f'Download gives the untouched HEIC.</div>') if heic else ""
        bottom = (f'<div class="p-bottom"><div class="row"><span>3 / 68</span><span>{"2.9" if heic else "3.2"} MB · {"HEIC" if heic else "JPEG"}</span></div>'
                  f'Tue 24 Nov, 14:22{note}</div>')
        name = "IMG_5022.HEIC" if heic else "IMG_5021.JPG"
        notes = src(("immich", "the viewer gives the picture the screen, actions in one icon row"), ("uppy", "the 1600 px copy is made on the phone at upload"))
    elif sid == "f-video":
        stage = (f'<div class="p-stage"><div class="vid tn t3"><div class="bp">{ic("play", px=6)}</div>'
                 f'<div class="ctl">{ic("play", px=2)}<span>0:00</span><div class="scrub"></div><span>0:41</span></div></div></div>')
        bottom = '<div class="p-bottom"><div class="row"><span>7 / 68</span><span>118 MB · MOV</span></div>Tue 24 Nov, 14:31</div>'
        name = "IMG_5024.MOV"
        notes = src(("immich", "the viewer chrome stays out of the way"))
    else:
        stage = '<div class="p-stage"><div class="pg"><i class="t"></i><i></i><i></i><i style="width:80%"></i><i class="g"></i><i></i><i style="width:70%"></i><i></i></div></div>'
        bottom = (f'<div class="p-bottom"><div class="row"><span>Page 1 of 3</span><span>820 KB · PDF</span></div>Tue 24 Nov, 15:02'
                  f'<div class="acts"><a class="p-btn" href="#{sid}">Open PDF</a></div></div>')
        name = "Recipe cards.pdf"
        notes = src(("immich", "same viewer frame for every kind of file"))
    return (f'<section class="screen p-files p-view" id="{sid}"><div class="p-top">{top_back}<span class="nm">{name}</span>{dl}</div>'
            f'{stage}{bottom}{notes}</section>')


def build():
    parts = [up_screen(sid, name) for sid, name in UPLOAD_SCREENS] + [files_screen(sid) for sid, _ in FILES_SCREENS]
    return page("Provino: files mockup", "provino", read(os.path.join(HERE, "src", "provino.css")), "\n".join(parts),
                scheme="dark", links=[("copione.html", "copione"), ("sipario.html", "sipario"), ("moodboard.html", "moodboard")])
