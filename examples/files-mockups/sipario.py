import os

from lib import (BATCH_DAY, FILES_SCREENS, UPLOAD_SCREENS, from_note, ic, mbtext, page, read, say, scenario, totals)

HERE = os.path.dirname(os.path.abspath(__file__))
SIGNED_IN = "wren"

SRC = {
    "gphotos": ("Google Photos 2026", "gphotos", None),
    "gdrive": ("Google Drive Material 3 Expressive", "gdrive", None),
    "ios": ("iOS 26 Photos", "ios26", None),
    "ente": ("Ente upload card", "ente", None),
    "dropbox": ("Dropbox iOS upload sheet", "dropbox", None),
    "immich": ("Immich v3", "immich", None),
    "untitled": ("Untitled UI file queue", "untitledui", None),
    "eleken": ("Eleken upload guide 2026", "eleken", None),
    "nuxt": ("Nuxt UI FileUpload", "nuxtui", None),
    "retro": ("Setproduct retro UI 2026", "retro", None),
    "twentyfirst": ("21st.dev upload components", "twentyfirst", None),
    "saasframe": ("SaaSFrame empty states", "saasframe", None),
    "linear": ("Linear", "linear", None),
}


def src(*pairs):
    return from_note([(SRC[k][0], SRC[k][1], t) for k, t in pairs])


def mast():
    return f'<header class="s-mast"><a class="s-mark" href="#u-ready">files</a><span class="s-ident">{SIGNED_IN}</span></header>'


def tabs(active):
    f = " on" if active == "files" else ""
    u = " on" if active == "upload" else ""
    return (f'<nav class="s-tabs" aria-label="Files and upload"><a class="s-tab{f}" href="#f-root">{ic("folder", px=3)} Files</a>'
            f'<a class="s-tab{u}" href="#u-ready">{ic("up", px=3)} Upload</a></nav>')


def props(fs, kind):
    pick = [f for f in fs if f["state"] in ("sending", "paused", "resuming", "failed", "refused")][:3]
    out = []
    for f in pick:
        if kind == "bad":
            if f["state"] == "refused":
                continue
        cls = "s-prop"
        ov = ""
        pc = f'{round(f["frac"] * 100)}%'
        if f["state"] == "paused":
            cls += " dim"
            ov = f'<div class="ov">{ic("pause")}</div>'
        elif f["state"] == "resuming":
            cls += " dim"
            ov = f'<div class="ov">{ic("glass")}</div>'
        elif f["state"] == "failed":
            cls += " bad"
            ov = f'<div class="ov">{ic("warn")}</div>'
            pc = "stopped"
        out.append(f'<div class="{cls} tn t{f["scene"]}">{ov}<span class="pc">{pc}</span></div>')
    return f'<div class="s-props">{"".join(out)}</div>' if out else ""


def stage(o, inner="", plaque=""):
    return (f'<div class="s-stage" style="--o:{o:.2f}"><div class="s-arch"><div class="s-in"><div class="s-spot"></div><div class="s-floor"></div>'
            f'{inner}<div class="s-curt l"></div><div class="s-curt r"></div><div class="s-fringe"></div>{plaque}</div></div></div>')


def plaque(icon, title, small="", warn=False):
    return f'<div class="s-plaque{" warn" if warn else ""}">{ic(icon)}<span>{title}</span><small>{small}</small></div>'


def rr(f):
    retry = '<a class="retry" href="#u-sending">Retry</a>' if f["state"] == "failed" else ""
    return f'<div class="s-r {f["state"]}"><i></i><div class="nm">{f["name"]}</div><div class="st">{say(f)}</div>{retry}</div>'


def grp(title, rows, more=0, more_word="more"):
    tail = f'<div class="s-r"><i></i><div class="more">and {more} {more_word}</div></div>' if more > 0 else ""
    return f'<div class="s-grp"><h3>{title} · {len(rows) + more}</h3>{"".join(rr(f) for f in rows)}{tail}</div>'


def details(fs, name, open_):
    live = [f for f in fs if f["state"] in ("sending", "paused", "resuming")]
    wait = [f for f in fs if f["state"] == "waiting"]
    bad = [f for f in fs if f["state"] in ("failed", "refused")]
    memo = [f for f in fs if f["state"] == "memo"]
    done = [f for f in fs if f["state"] == "done"]
    parts = []
    if bad:
        parts.append(grp("Needs you", bad))
    if live:
        parts.append(grp({"paused": "Paused", "resuming": "Carrying on"}.get(live[0]["state"], "Sending now"), live))
    if memo:
        part = [f for f in memo if f["note"] == "part-way"]
        rest = [f for f in memo if f["note"] != "part-way"]
        parts.append(grp("Part-way", part))
        parts.append(grp("Not started", rest[:2], len(rest) - 2, "not started"))
    if wait:
        parts.append(grp("Waiting", wait[:3], len(wait) - 3, "waiting"))
    if done:
        parts.append(grp("Saved", done[-3:] if name != "done" else done[:4], len(done) - (3 if name != "done" else 4), "saved"))
    return (f'<details class="s-det"{" open" if open_ else ""}><summary><span>Show each file · {len(fs)}</span>{ic("next", px=2)}</summary>'
            f'<div class="s-det-wide">{"".join(parts)}</div></details>')


def up_screen(sid, name):
    fs, _ = scenario(name)
    t = totals(fs)
    n = len(fs)
    default = " default" if name == "ready" else ""
    head = f'<section class="screen s-up{default}" id="{sid}">{mast()}<main class="s-wrap">'
    tail = f'</main>{tabs("upload")}'
    if name == "ready":
        st = stage(0.0, plaque=plaque("up", "Nothing sent yet", "The curtain opens as photos are saved."))
        body = (f'<h1 class="s-h">Upload</h1><p class="s-lede">Photos and videos go to your folder, in uploads / {BATCH_DAY}.</p>{st}'
                f'<a class="s-go" href="#u-sending">{ic("up", px=3)} Choose photos and videos</a>'
                f'<div class="s-heic"><span class="c">AWAKE</span><span><b>The screen stays awake</b> while files send.</span></div>'
                f'<div class="s-heic"><span class="c">LOCKED</span><span><b>If it locks anyway,</b> open this page again. Each file carries on from its last saved part.</span></div>'
                f'<div class="s-heic"><span class="c">HEIC</span><span><b>iPhone photos are saved as they are.</b> Small previews appear about a minute later.</span></div>')
        notes = src(("gdrive", "one container, one job, rounded off the rest of the page"), ("ente", "the upload is a single card with a clear next step"),
                    ("retro", "pixel stepped arch and fringe, no gradients"))
        return head + body + tail + notes + "</section>"
    o = {"problem": n and (t["n"] / n)}.get(name, t["pct"])
    if name == "reload":
        o = 0.0
    if name == "done":
        o = 1.0
    body = ""
    if name == "sending":
        st = stage(o, props(fs, "ok"))
        body = (f'{st}<div class="s-count"><b>{t["n"]}</b><span>of {n} saved</span></div>'
                f'<p class="s-line">About {t["left_min"]} minutes left<small>{mbtext(t["done"])} of {mbtext(t["total"])} · screen stays on</small></p>'
                f'<a class="s-go" href="#u-paused">{ic("pause", px=3)} Pause</a><div class="s-two"><a href="#u-sending">{ic("plus", px=2)} Add more</a></div>')
    elif name == "paused":
        st = stage(o, props(fs, "ok"), plaque("pause", "Paused", "Finished parts are kept."))
        body = (f'{st}<div class="s-count"><b>{t["n"]}</b><span>of {n} saved</span></div>'
                f'<p class="s-line">On hold<small>{mbtext(t["done"])} of {mbtext(t["total"])}</small></p>'
                f'<a class="s-go" href="#u-sending">{ic("play", px=3)} Resume</a><div class="s-two"><a href="#u-sending">{ic("plus", px=2)} Add more</a></div>')
    elif name == "away":
        st = stage(o, props(fs, "ok"))
        body = (f'{st}<div class="s-count"><b>{t["n"]}</b><span>of {n} saved</span></div>'
                f'<div class="s-note"><b>Welcome back.</b> The screen was off from 12:41 to 12:47, so uploads stopped. Each file is carrying on from its last saved part.</div>'
                f'<a class="s-go" href="#u-paused">{ic("pause", px=3)} Pause</a>')
    elif name == "reload":
        st = stage(o, plaque="" + plaque("warn", "This page was closed", f"{t['n']} saved, {n - t['n']} to choose again.", warn=True))
        body = (f'{st}<div class="s-count"><b>{t["n"]}</b><span>of {n} saved</span></div>'
                f'<div class="s-note warn"><b>Nothing is lost.</b> Choose the same photos and videos again. The {t["n"]} that are saved get skipped, and part-way ones carry on.</div>'
                f'<a class="s-go" href="#u-away">{ic("up", px=3)} Choose the same photos again</a>')
    elif name == "problem":
        st = stage(o, props(fs, "bad"))
        body = (f'{st}<div class="s-count"><b>{t["n"]}</b><span>of {n} saved</span></div>'
                f'<p class="s-line">3 need you<small>2 stopped, 1 can\'t be uploaded here</small></p>'
                f'<a class="s-go" href="#u-sending">Retry 2 stopped files</a>')
    else:
        heic = sum(1 for f in fs if f["kind"] == "heic")
        st = stage(o, plaque=plaque("check", "All saved", ""))
        body = (f'{st}<div class="s-count"><b>{n}</b><span>all saved</span></div>'
                f'<p class="s-line">{mbtext(t["total"])} in uploads / {BATCH_DAY}<small>You can close this page</small></p>'
                f'<div class="s-heic"><span class="c">HEIC</span><span><b>{heic} iPhone photos are saved as they are.</b> Small previews appear in about a minute. Download works now.</span></div>'
                f'<a class="s-go" href="#f-folder">{ic("folder", px=3)} Open your folder</a><div class="s-two"><a href="#u-ready">{ic("plus", px=2)} Upload more</a></div>')
    open_ = name in ("problem", "reload")
    body += details(fs, name, open_)
    notes = {"sending": src(("dropbox", "count and time left in the header"), ("immich", "screen wake lock while uploading (v3.1.0, HTTPS)"),
                            ("gdrive", "the stage is one container"), ("eleken", "state per file, one summary above")),
             "paused": src(("ente", "stop, then select the same files again; finished files stay"), ("linear", "one primary action per screen")),
             "away": src(("ente", "files already saved are skipped on re-select"), ("immich", "web wake lock needs HTTPS and is released when the page hides")),
             "reload": src(("ente", "stop and resume by selecting the same files again"), ("eleken", "plain recovery text, no blame")),
             "problem": src(("untitled", "failed items stand apart with a plain Try again"), ("eleken", "errors beside the file, a summary above"), ("dropbox", "row with name then state")),
             "done": src(("twentyfirst", "the after state is a designed screen"), ("ente", "completion dialog: what happened and what's left"))}[name]
    return head + body + tail + notes + "</section>"


def crumbs(items):
    out = []
    for i, (label, href) in enumerate(items):
        if i:
            out.append('<span class="sep">/</span>')
        out.append(f'<a href="{href}">{label}</a>' if href else f'<span class="here">{label}</span>')
    return f'<nav class="s-crumbs" aria-label="Where you are">{"".join(out)}</nav>'


def pic(scene, kind, href, dur=""):
    tag = f'<span class="tag">{ic("play", px=2)}{dur}</span>' if kind == "video" else ""
    if kind == "soon":
        return f'<a class="s-pic wait" href="{href}"><span>{ic("glass", px=3)}preview on its way</span></a>'
    h = '<span class="heic">HEIC</span>' if kind == "heic" else ""
    return f'<a class="s-pic tn t{scene}" href="{href}">{h}{tag}</a>'


def files_screen(sid):
    if sid == "f-root":
        newest = (pic(2, "photo", "#f-photo") + pic(0, "soon", "#f-heic") + pic(3, "video", "#f-video", "0:41") + pic(5, "photo", "#f-photo") + pic(9, "heic", "#f-heic") + pic(1, "photo", "#f-photo"))
        albums = (f'<a class="s-alb" href="#f-folder"><div class="top">{ic("folder", px=4)}<b>uploads</b><span>68 files</span></div>'
                  f'<div class="mini"><i class="tn t2"></i><i class="tn t9"></i><i class="tn t5"></i><i class="tn t3"></i><i class="tn t1"></i></div></a>'
                  f'<a class="s-alb" href="#f-pdf"><div class="top">{ic("folder", px=4)}<b>Documents</b><span>2 files</span></div>'
                  f'<div class="mini"><i class="doc">{ic("pdf", px=3)}</i><i class="doc">{ic("pdf", px=3)}</i></div></a>')
        body = (f'{crumbs([("Your files", None)])}<h1 class="s-h">Your files</h1><p class="s-lede">Only you can see these.</p>'
                f'<div class="s-sec">Newest<span>from uploads</span></div><div class="s-snap">{newest}</div>'
                f'<div class="s-sec">Folders<span>2</span></div><div class="s-albs">{albums}</div>')
        notes = src(("gphotos", "customizable Collections: cards with a cover, newest first"), ("ios", "bottom tabs: library and collections are separate"),
                    ("gdrive", "folders sit in containers"))
        return f'<section class="screen s-files" id="{sid}">{mast()}<main class="s-wrap">{body}</main>{tabs("files")}{notes}</section>'
    if sid == "f-folder":
        photos = (pic(2, "photo", "#f-photo") + pic(0, "soon", "#f-heic") + pic(5, "photo", "#f-photo") + pic(1, "photo", "#f-photo") + pic(9, "heic", "#f-heic")
                  + pic(4, "photo", "#f-photo") + pic(7, "photo", "#f-photo") + pic(10, "photo", "#f-photo") + pic(6, "heic", "#f-heic"))
        vids = ('<a class="s-vid tn t3" href="#f-video"><div class="pl">' + ic("play", px=5) + '</div><span class="du">0:41</span></a>'
                '<a class="s-vid tn t6" href="#f-video"><div class="pl">' + ic("play", px=5) + '</div><span class="du">2:08</span></a>')
        docs = (f'<a class="s-docrow" href="#f-pdf"><div class="gl">{ic("pdf", px=3)}</div><div><b>Recipe cards.pdf</b><br><span>820 KB · 3 pages</span></div>{ic("next", px=2)}</a>')
        body = (f'{crumbs([("Your files", "#f-root"), ("uploads", "#f-root"), ("2026-11-24", None)])}<h1 class="s-h">Tuesday 24 Nov</h1>'
                f'<p class="s-lede">41 files · 2.4 GB</p>'
                f'<div class="s-kind">Photos<span>36</span></div><div class="s-g3">{photos}</div>'
                f'<div class="s-two" style="justify-content:flex-start"><a href="#f-folder">Show all 36 {ic("next", px=2)}</a></div>'
                f'<div class="s-kind">Videos<span>4</span></div><div class="s-vids">{vids}</div>'
                f'<div class="s-kind">Documents<span>1</span></div>{docs}')
        notes = src(("gphotos", "grouped by kind, each group a container"), ("immich", "tiles with no gutters on a phone, larger on wide screens"),
                    ("gdrive", "containers instead of one long list"))
        return f'<section class="screen s-files default-no" id="{sid}">{mast()}<main class="s-wrap">{body}</main>{tabs("files")}{notes}</section>'
    if sid == "f-empty":
        st = stage(0.0, plaque=plaque("photo", "Nothing here yet", "Photos and videos you upload show up here."))
        body = (f'{crumbs([("Your files", None)])}<h1 class="s-h">Your files</h1>{st}'
                f'<a class="s-go" href="#u-ready">{ic("up", px=3)} Upload photos</a>')
        notes = src(("saasframe", "an empty screen says what to do next, with one button"), ("twentyfirst", "an empty state names the action"))
        return f'<section class="screen s-files" id="{sid}">{mast()}<main class="s-wrap">{body}</main>{tabs("files")}{notes}</section>'
    close = f'<a href="#f-folder" aria-label="Close">{ic("close", px=3)}</a>'
    nav = f'<div class="pn"><a href="#{sid}">{ic("prev", px=2)} Previous</a><a href="#{sid}">Next {ic("next", px=2)}</a></div>'
    dl = f'<a class="s-go" href="#{sid}">{ic("down", px=3)} Download</a>'
    if sid == "f-photo":
        body = (f'<div class="pv tn b5"></div><div class="meta"><span>Size <b>3.2 MB</b></span><span>Taken <b>24 Nov, 14:22</b></span><span>JPEG</span></div>{nav}{dl}')
        title = "IMG_5021.JPG"
        notes = src(("gphotos", "bottom sheet, content stays visible behind"), ("immich", "wide screens use a drawer on the right"))
    elif sid == "f-heic":
        body = (f'<div class="pv wait"><span>{ic("glass")}Making a preview. About a minute.</span></div>'
                f'<div class="meta"><span>Size <b>2.9 MB</b></span><span>Taken <b>26 Nov, 12:48</b></span><span>HEIC</span></div>'
                f'<div class="note"><b>HEIC is the iPhone\'s own photo format.</b> It is saved exactly as you sent it. A JPEG preview is being made on the server for every other device. Apple devices show the original straight away.</div>{dl}')
        title = "IMG_5030.HEIC"
        notes = src(("gphotos", "status inside the sheet, not a modal"), ("eleken", "say what is happening and how long"))
    elif sid == "f-video":
        body = (f'<div class="pv vid tn t3"><div class="pl">{ic("play", px=6)}</div><div class="ctl">{ic("play", px=2)}<span>0:00</span><div class="scrub"></div><span>0:41</span></div></div>'
                f'<div class="meta"><span>Size <b>118 MB</b></span><span>Length <b>0:41</b></span><span>MOV</span></div>{nav}{dl}')
        title = "IMG_5024.MOV"
        notes = src(("gphotos", "bottom sheet, content stays visible behind"))
    else:
        body = ('<div class="pg"><i class="t"></i><i></i><i></i><i style="width:80%"></i><i class="g"></i><i></i><i style="width:70%"></i><i></i></div>'
                f'<div class="meta"><span>Size <b>820 KB</b></span><span>Pages <b>3</b></span><span>PDF</span></div>'
                f'<a class="s-go" href="#{sid}">Open PDF</a><div class="s-two"><a href="#{sid}">{ic("down", px=2)} Download</a></div>')
        title = "Recipe cards.pdf"
        notes = src(("gdrive", "the file opens in its own container"))
    return (f'<section class="screen s-sheet" id="{sid}"><div class="grab"><i></i><i></i><i></i></div>'
            f'<div class="bar"><b>{title}</b>{close}</div><div class="body">{body}</div>{notes}</section>')


def build():
    parts = [up_screen(sid, name) for sid, name in UPLOAD_SCREENS] + [files_screen(sid) for sid, _ in FILES_SCREENS]
    return page("Sipario: files mockup", "sipario", read(os.path.join(HERE, "src", "sipario.css")), "\n".join(parts),
                links=[("copione.html", "copione"), ("provino.html", "provino"), ("moodboard.html", "moodboard")])
