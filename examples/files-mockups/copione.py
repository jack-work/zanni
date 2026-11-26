import os

from lib import (BATCH_DAY, FILES_SCREENS, ICONS, SCENES, UPLOAD_SCREENS, from_note, ic, mbtext, page, read,
                 say, scenario, totals)

HERE = os.path.dirname(os.path.abspath(__file__))
SIGNED_IN = "wren"


def mast(right=""):
    return f'<header class="c-mast"><a class="c-mark" href="#u-ready">files</a>{right}</header>'


def up_mast():
    return mast(f'<span class="c-ident">{SIGNED_IN}</span>')


def files_mast():
    return mast(f'<a class="c-btn" href="#u-ready">{ic("up", px=2)} Upload</a>')


def thumb(f):
    cls = f"th tn t{f['scene']}"
    dur = f'<span class="dur">{f["dur"]}</span>' if f["dur"] else ""
    if f["state"] == "refused":
        return f'<div class="th noimg">{ic("warn", px=3)}</div>'
    return f'<div class="{cls}">{dur}</div>'


def row(f):
    st = f["state"]
    chip = ' <span class="c-chip mute">HEIC</span>' if f["kind"] == "heic" and st in ("done", "waiting", "memo") else ""
    bar = ""
    if st in ("sending", "resuming", "paused", "failed"):
        mod = {"sending": "live", "resuming": "live", "paused": "hold", "failed": "fail"}[st]
        bar = f'<div class="c-bar {mod}" style="--p:{f["frac"]:.2f}"><span></span></div>'
    action = ""
    if st == "failed":
        action = '<a class="c-btn" href="#u-sending">Retry</a>'
    elif st == "refused":
        action = '<a class="c-btn ghost" href="#u-done">Remove</a>'
    size = f'<span class="c-chip mute">{mbtext(f["mb"])}</span>' if st in ("waiting", "memo") else ""
    return (f'<li class="c-row {st}">{thumb(f)}<div class="go"><div class="nm">{f["name"]}</div>'
            f'<div class="st">{say(f)}{chip}</div>{bar}</div>{action or size}</li>')


def sec(label, n):
    return f'<h2 class="c-sec">{label} · {n}</h2>'


def saved_block(fs, open_=False):
    done = [f for f in fs if f["state"] == "done"]
    if not done:
        return ""
    shown = done[-3:] if not open_ else done[:6]
    more = len(done) - len(shown)
    rows = "".join(row(f) for f in shown)
    tail = f'<li class="c-more">and {more} more saved</li>'.replace("<li", "<li style=\"border:0;padding:6px 0\"") if more > 0 else ""
    return (f'<details class="c-saved"{" open" if open_ else ""}><summary>{ic("check", px=3)} {len(done)} saved'
            f'<span class="tl">{ic("next", px=2)}</span></summary><ul class="c-rows">{rows}{tail}</ul></details>')


def sections(fs, name):
    live = [f for f in fs if f["state"] in ("sending", "paused", "resuming")]
    wait = [f for f in fs if f["state"] == "waiting"]
    bad = [f for f in fs if f["state"] in ("failed", "refused")]
    memo = [f for f in fs if f["state"] == "memo"]
    out = []
    if bad:
        out.append(sec("Need you", len(bad)) + '<ul class="c-rows">' + "".join(row(f) for f in bad) + "</ul>")
    if live:
        label = {"paused": "Paused", "resuming": "Carrying on"}.get(live[0]["state"], "Sending now")
        out.append(sec(label, len(live)) + '<ul class="c-rows">' + "".join(row(f) for f in live) + "</ul>")
    if memo:
        part = [f for f in memo if f["note"] == "part-way"]
        rest = [f for f in memo if f["note"] != "part-way"]
        out.append(sec("Part-way", len(part)) + '<ul class="c-rows">' + "".join(row(f) for f in part) + "</ul>")
        out.append(sec("Not started", len(rest)) + '<ul class="c-rows">' + "".join(row(f) for f in rest[:2])
                   + f'<li class="c-more">and {len(rest) - 2} more not started</li></ul>')
    if wait:
        out.append(sec("Waiting", len(wait)) + '<ul class="c-rows">' + "".join(row(f) for f in wait[:3])
                   + f'<li class="c-more">and {len(wait) - 3} more waiting</li></ul>')
    out.append(saved_block(fs, open_=name == "done"))
    return "".join(out)


FACTS = (
    f'<ul class="c-facts"><li><span class="c-chip ok">Awake</span><span>The screen stays awake while files go up.</span></li>'
    f'<li><span class="c-chip warn">Locked</span><span>If it locks anyway, open this page again. Each file carries on from its last saved part.</span></li>'
    f'<li><span class="c-chip mute">HEIC</span><span>iPhone photos in HEIC are saved exactly as they are.</span></li></ul>'
)

SRC = {
    "dropbox": ("Dropbox iOS upload sheet", "dropbox", "count and time left in the header, thumbnail rows with a hairline bar"),
    "untitled": ("Untitled UI file queue", "untitledui", "failed row outlined in red with a plain Try again"),
    "ente": ("Ente upload card", "ente", "sections for in progress, completed, skipped, failed; pick the same files again to resume"),
    "immich": ("Immich v3", "immich", "wake lock while uploading, rows grouped under date headings"),
    "uppy": ("Uppy Dashboard", "uppy", "one overall status bar, pause and resume, add more"),
    "filepond": ("FilePond", "filepond", "status words under the file name, nothing else"),
    "retro": ("Setproduct retro UI 2026", "retro", "pixel icons, dotted focus rectangles"),
    "linear": ("Linear", "linear", "chrome stays quiet, colour is spent on state"),
    "eleken": ("Eleken upload guide 2026", "eleken", "state per file, errors beside the file, a summary above"),
}


def src(*keys):
    return from_note([(SRC[k][0], SRC[k][1], SRC[k][2]) for k in keys])


def up_screen(sid, name):
    fs, meta = scenario(name)
    t = totals(fs)
    n = len(fs)
    banner = ""
    dock = ""
    body = ""
    awake = f'<span class="c-chip ok">Screen stays on</span>'
    if name == "ready":
        body = (f'<a class="c-pick" href="#u-sending">{ic("up")}<span class="lab">Choose photos and videos</span>'
                f'<small>Photos, videos and contact cards. Pick as many as you like.</small></a>{FACTS}'
                f'<p class="c-hint">Last time: 12 files saved on 24 Nov. <a href="#f-folder">See them</a></p>')
        main = ""
        notes = src("filepond", "ente", "immich", "retro")
    else:
        if name == "sending":
            head = f'<div class="big">Uploading, {t["n"]} of {n} saved</div>'
            sub = f'{mbtext(t["done"])} of {mbtext(t["total"])} · about {t["left_min"]} min left'
            bar = f'<div class="c-bar live" style="--p:{t["pct"]:.2f}"><span></span></div>'
            chips = awake
            dock = f'<a class="c-btn" href="#u-paused">{ic("pause", px=3)} Pause</a><a class="c-btn ghost fixed" href="#u-sending">{ic("plus", px=2)} Add more</a>'
        elif name == "paused":
            head = f'<div class="big">Paused, {t["n"]} of {n} saved</div>'
            sub = f'{mbtext(t["done"])} of {mbtext(t["total"])} · finished parts are kept'
            bar = f'<div class="c-bar hold" style="--p:{t["pct"]:.2f}"><span></span></div>'
            chips = '<span class="c-chip warn">On hold</span>'
            dock = f'<a class="c-btn" href="#u-sending">{ic("play", px=3)} Resume</a><a class="c-btn ghost fixed" href="#u-sending">{ic("plus", px=2)} Add more</a>'
        elif name == "away":
            head = f'<div class="big">Carrying on, {t["n"]} of {n} saved</div>'
            sub = f'{mbtext(t["done"])} of {mbtext(t["total"])} · about {t["left_min"]} min left'
            bar = f'<div class="c-bar live" style="--p:{t["pct"]:.2f}"><span></span></div>'
            chips = awake
            banner = (f'<div class="c-note">{ic("lock")}<div><b>Welcome back.</b> The screen was off from 12:41 to 12:47, so uploads stopped. '
                      f'Each file is carrying on from its last saved part.</div></div>')
            dock = f'<a class="c-btn" href="#u-paused">{ic("pause", px=3)} Pause</a>'
        elif name == "reload":
            left = n - t["n"]
            head = f'<div class="big">{t["n"]} of {n} saved, {left} left</div>'
            sub = "Your iPhone closed this page while you were away"
            bar = f'<div class="c-bar hold" style="--p:{t["pct"]:.2f}"><span></span></div>'
            chips = '<span class="c-chip fail">Page was closed</span>'
            banner = (f'<div class="c-note warn">{ic("warn")}<div><b>Nothing is lost.</b> Choose the same photos and videos again. '
                      f'The {t["n"]} that are saved get skipped, and the part-way ones carry on.</div></div>')
            dock = f'<a class="c-btn" href="#u-away">{ic("up", px=3)} Choose them again</a>'
        elif name == "problem":
            bad = sum(1 for f in fs if f["state"] in ("failed", "refused"))
            head = f'<div class="big">{t["n"]} of {n} saved, {bad} need you</div>'
            sub = f'{mbtext(t["done"])} saved · the rest is below'
            bar = f'<div class="c-bar fail" style="--p:{t["n"] / n:.2f}"><span></span></div>'
            chips = '<span class="c-chip fail">2 stopped</span><span class="c-chip mute">1 not allowed</span>'
            dock = f'<a class="c-btn" href="#u-sending">Retry 2 stopped files</a>'
        else:
            head = f'<div class="done-head"></div>'
            bar = sub = chips = ""
        if name == "done":
            heic = sum(1 for f in fs if f["kind"] == "heic")
            sumhtml = (f'<div class="c-done"><div class="tick">{ic("check", px=5)}</div>'
                       f'<div class="big" style="font-size:30px">All {n} saved</div>'
                       f'<div class="sub" style="font:20px/1.2 var(--fontpack-mono);color:var(--z-muted)">{mbtext(t["total"])} in uploads / {BATCH_DAY}</div></div>')
            banner = (f'<div class="c-note"><span class="c-chip mute" style="margin-top:2px">HEIC</span>'
                      f'<div><b>{heic} iPhone photos are saved as they are.</b> They open on any Apple device. On other devices, '
                      f'the small copy shows and Download gives the original.</div></div>')
            dock = f'<a class="c-btn" href="#f-folder">Open your folder</a><a class="c-btn ghost" href="#u-ready">Upload more</a>'
            body = f'<div class="c-sum">{sumhtml}</div><p class="c-hint">You can close this page now.</p>'
        else:
            body = (f'<div class="c-sum"><div class="hd">{head}</div><div class="sub">{sub}</div>{bar}'
                    f'<div class="chips">{chips}</div></div>')
        main = banner + sections(fs, name)
        notes = {"sending": src("dropbox", "uppy", "immich", "linear"),
                 "paused": src("uppy", "ente"),
                 "away": src("ente", "immich", "eleken"),
                 "reload": src("ente", "eleken"),
                 "problem": src("untitled", "eleken", "dropbox"),
                 "done": src("ente", "untitled")}[name]
    aside = f'<aside class="c-aside"><h1 class="c-h">Upload</h1><p class="c-lede">Going to <b>your folder</b>, in uploads / {BATCH_DAY}.</p>{body}'
    if name == "ready":
        aside += "</aside>"
        main_html = '<main class="c-main"><p class="c-lede">Choose files and this page does the rest. Nothing leaves your phone until you do.</p></main>'
        main_html = ""
    else:
        aside += (f'<div class="c-dock">{dock}</div>' if dock else "") + "</aside>"
        main_html = f'<main class="c-main">{main}</main>'
    default = " default" if name == "ready" else ""
    return f'<section class="screen c-up{default}" id="{sid}">{up_mast()}<div class="c-wrap">{aside}{main_html}</div>{notes}</section>'


def crumbs(items):
    out = []
    for i, (label, href) in enumerate(items):
        if i:
            out.append('<span class="sep">/</span>')
        out.append(f'<a href="{href}">{label}</a>' if href else f'<span class="here">{label}</span>')
    return f'<nav class="c-crumbs" aria-label="Where you are">{"".join(out)}</nav>'


ITEMS = [
    ("IMG_5021.JPG", "photo", 2, "3.2 MB", "14:22", ""),
    ("IMG_5022.HEIC", "heic", 9, "2.9 MB", "14:22", ""),
    ("IMG_5023.JPG", "photo", 5, "4.4 MB", "14:23", ""),
    ("IMG_5024.MOV", "video", 3, "118 MB", "14:31", "0:41"),
    ("IMG_5025.JPG", "photo", 1, "3.8 MB", "14:40", ""),
    ("IMG_5026.HEIC", "heic", 4, "3.1 MB", "14:41", ""),
    ("IMG_5027.JPG", "photo", 7, "2.2 MB", "14:41", ""),
    ("Recipe cards.pdf", "pdf", 0, "820 KB", "15:02", ""),
    ("IMG_5028.JPG", "photo", 10, "5.0 MB", "15:10", ""),
    ("IMG_5029.MOV", "video", 6, "342 MB", "15:12", "2:08"),
]


def item_row(name, kind, scene, size, when, dur, href):
    if kind == "pdf":
        th = f'<div class="th noimg">{ic("pdf", px=3)}</div>'
    else:
        d = f'<span class="dur">{dur}</span>' if dur else ""
        th = f'<div class="th tn t{scene}">{d}</div>'
    chip = ' <span class="c-chip mute">HEIC</span>' if kind == "heic" else ""
    return (f'<li><a class="c-item" href="{href}">{th}<div><div class="nm">{name}</div>'
            f'<div class="mt">{size} · {when}{chip}</div></div><span class="size">{size}</span><span class="when">24 Nov, {when}</span>'
            f'<span class="dl" aria-hidden="true">{ic("down", px=2)}</span><span class="go">{ic("next", px=2)}</span></a></li>')


def dir_row(name, meta, href):
    return (f'<li><a class="c-item dir" href="{href}"><div class="th fold">{ic("folder", px=3)}</div><div>'
            f'<div class="nm">{name}</div><div class="mt">{meta}</div></div><span class="size"></span><span class="when"></span>'
            f'<span class="dl" style="visibility:hidden"></span><span class="go">{ic("next", px=2)}</span></a></li>')


COLHEAD = '<div class="c-colhead"><span></span><span>Name</span><span>Size</span><span>Modified</span><span></span></div>'

FSRC = {
    "immich": ("Immich v3", "immich", "date headings, a viewer that gives the picture the whole screen"),
    "dropbox": ("Dropbox new web", "dropbox-new", "an upload action always in reach"),
    "saasframe": ("SaaSFrame empty states", "saasframe", "an empty folder says what to do next, with one button"),
    "gdrive": ("Google Drive Material 3 Expressive", "gdrive", "folders as their own row type"),
}


def fsrc(*keys):
    return from_note([(FSRC[k][0], FSRC[k][1], FSRC[k][2]) for k in keys])


def files_screen(sid):
    if sid == "f-root":
        lst = (dir_row("uploads", "3 folders · 24 Nov", "#f-folder") + dir_row("Documents", "2 files", "#f-pdf"))
        inner = (f'{crumbs([("Your files", None)])}<h1 class="c-h">Your files</h1>'
                 f'<p class="c-tally">2 folders · only you can see these</p>'
                 f'<div class="c-sheet">{COLHEAD}<ul class="c-list">{lst}</ul></div>')
        return f'<section class="screen c-files" id="{sid}">{files_mast()}<main class="c-wrap">{inner}</main>{fsrc("dropbox", "gdrive")}</section>'
    if sid == "f-folder":
        hrefs = {"photo": "#f-photo", "heic": "#f-heic", "video": "#f-video", "pdf": "#f-pdf"}
        lst = "".join(item_row(*it, hrefs[it[1]]) for it in ITEMS)
        inner = (f'{crumbs([("Your files", "#f-root"), ("uploads", "#f-root"), ("2026-11-24", None)])}<h1 class="c-h">Tuesday 24 Nov</h1>'
                 f'<p class="c-tally">41 files · 36 photos, 4 videos, 1 PDF · 2.4 GB</p>'
                 f'<div class="c-sheet">{COLHEAD}<ul class="c-list">{lst}</ul></div>'
                 f'<div class="c-page"><span>1 to 10 of 41</span><a href="#f-folder">Next 10 {ic("next", px=2)}</a></div>')
        return f'<section class="screen c-files" id="{sid}">{files_mast()}<main class="c-wrap">{inner}</main>{fsrc("immich", "dropbox")}</section>'
    if sid == "f-empty":
        inner = (f'{crumbs([("Your files", None)])}<h1 class="c-h">Your files</h1><p class="c-tally">0 files</p>'
                 f'<div class="c-sheet"><div class="c-empty">{ic("photo")}<h2>Nothing here yet</h2>'
                 f'<p>Photos and videos you upload from your phone show up here.</p>'
                 f'<a class="c-btn" href="#u-ready">{ic("up", px=3)} Upload photos</a></div></div>')
        return f'<section class="screen c-files" id="{sid}">{files_mast()}<main class="c-wrap">{inner}</main>{fsrc("saasframe")}</section>'
    return view_screen(sid)


def view_screen(sid):
    back = f'<a class="c-back" href="#f-folder">{ic("prev", px=3)} Back</a>'
    dl = f'<a class="c-btn ghost" style="min-height:44px;padding:6px 12px 4px;font-size:21px" href="#{sid}">{ic("down", px=2)} Download</a>'
    pager = (f'<div class="c-page"><a href="#{sid}">{ic("prev", px=2)} Previous</a><span>3 of 41</span><a href="#{sid}">Next {ic("next", px=2)}</a></div>')
    if sid in ("f-photo", "f-heic"):
        heic = sid == "f-heic"
        name = "IMG_5022.HEIC" if heic else "IMG_5021.JPG"
        big = "b9" if heic else "b5"
        media = f'<figure class="c-mat"><div class="c-img tn {big}"></div></figure>'
        note = ""
        if heic:
            note = (f'<div class="c-note c-aside-note">{ic("photo")}<div><b>HEIC is the iPhone\'s own photo format.</b> '
                    f'Apple devices show it as is. On other devices this page shows the small copy, and Download gives the original.</div></div>')
        side = (f'<dl class="c-meta" style="margin-top:0"><span>Size <b>{"2.9" if heic else "3.2"} MB</b></span><span>Taken <b>24 Nov, 14:22</b></span>'
                f'<span>Type <b>{"HEIC" if heic else "JPEG"}</b></span></dl><div class="c-acts"><a class="c-btn" href="#{sid}">{ic("down", px=3)} Download</a></div>{note}')
        s = ("immich", "dropbox") if not heic else ("immich", "saasframe")
        return view_wrap(sid, back, name, dl, media + pager, side, fsrc("immich", "dropbox"))
    if sid == "f-video":
        media = (f'<div class="c-vid tn t3"><div class="scrim"></div><div class="bigplay">{ic("play", px=6)}</div>'
                 f'<div class="ctl">{ic("play", px=2)}<span>0:00</span><div class="scrub"><i></i></div><span>0:41</span></div></div>')
        side = (f'<dl class="c-meta" style="margin-top:0"><span>Size <b>118 MB</b></span><span>Length <b>0:41</b></span><span>Type <b>MOV</b></span></dl>'
                f'<div class="c-acts"><a class="c-btn" href="#{sid}">{ic("down", px=3)} Download</a></div>'
                f'<div class="c-note c-aside-note">{ic("video")}<div>Plays here without leaving the page. Seeking works on a phone.</div></div>')
        return view_wrap(sid, back, "IMG_5024.MOV", dl, media + pager, side, fsrc("immich"))
    media = (f'<div class="c-doc"><div class="c-paper"><i class="t"></i><i class="s"></i><i></i><i></i><i style="width:80%"></i><i class="g"></i><i></i><i style="width:70%"></i><i></i><i style="width:55%"></i></div></div>')
    side = (f'<dl class="c-meta" style="margin-top:0"><span>Size <b>820 KB</b></span><span>Pages <b>3</b></span><span>Type <b>PDF</b></span></dl>'
            f'<div class="c-acts"><a class="c-btn" href="#{sid}">Open PDF</a><a class="c-btn ghost" href="#{sid}">{ic("down", px=3)} Download</a></div>')
    return view_wrap(sid, back, "Recipe cards.pdf", dl, media, side, fsrc("dropbox"))


def view_wrap(sid, back, name, dl, media, side, notes):
    return (f'<section class="screen c-files c-view" id="{sid}">{mast(back + f"<span class=ttl>{name}</span>" + dl)}'
            f'<main class="c-wrap"><div class="c-stage">{media}</div><div class="c-side">{side}</div></main>{notes}</section>')


def build():
    parts = [up_screen(sid, name) for sid, name in UPLOAD_SCREENS] + [files_screen(sid) for sid, _ in FILES_SCREENS]
    return page("Copione: files mockup", "copione", read(os.path.join(HERE, "src", "copione.css")), "\n".join(parts),
                links=[("provino.html", "provino"), ("sipario.html", "sipario"), ("moodboard.html", "moodboard")])
