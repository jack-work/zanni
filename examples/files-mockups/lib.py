import base64
import math
import os
import random
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "assets")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def fonts_css():
    d = os.path.join(ASSETS, "fontpack", "fonts")
    faces = [
        ("Jacquard 24", "normal", "400", "jacquard-24.woff2"),
        ("EB Garamond", "normal", "400 600", "eb-garamond.woff2"),
        ("EB Garamond", "italic", "400", "eb-garamond-italic.woff2"),
        ("VT323", "normal", "400", "vt323.woff2"),
    ]
    return "\n".join(
        f"@font-face{{font-family:'{n}';font-style:{s};font-weight:{w};font-display:swap;"
        f"src:url(data:font/woff2;base64,{b64(os.path.join(d, f))}) format('woff2')}}"
        for n, s, w, f in faces
    )


BASE_CSS = """:root{--fontpack-display:'Jacquard 24','Cormorant Garamond',serif;--fontpack-prose:'EB Garamond',Georgia,'Times New Roman',serif;--fontpack-mono:'VT323',ui-monospace,'Courier New',monospace}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:var(--fontpack-prose);font-feature-settings:'kern' 1,'liga' 1,'lnum' 1;-webkit-text-size-adjust:100%}
a{color:var(--z-accent)}
h1,h2,h3,p,ul,dl{margin-top:0}
button{font:inherit}
"""


def zanni_css():
    return BASE_CSS + read(os.path.join(ASSETS, "gesso", "gesso.css")) + "\n" + read(os.path.join(ASSETS, "rotolo", "rotolo.css"))


ICONS = {
    "folder": ["####......", "#oo#######", "#oooooooo#", "#oooooooo#", "#oooooooo#", "#oooooooo#", "#oooooooo#", "##########"],
    "photo": ["##########", "#oooooooo#", "#oooo##oo#", "#oooo##oo#", "#oo#oooooo", "#o###oo#o#", "##########"],
    "video": ["##########", "#o#oooooo#", "#o##ooooo#", "#o###oooo#", "#o##ooooo#", "#o#oooooo#", "#oooooooo#", "##########"],
    "pdf": ["#####...", "#oooo##.", "#oooo#o#", "#oooo###", "#oooooo#", "#o####o#", "#oooooo#", "#o####o#", "#oooooo#", "########"],
    "check": ["........#", ".......##", "#.....##.", "##...##..", ".##.##...", "..###....", "...#....."],
    "warn": ["#########", "#ooo#ooo#", "#ooo#ooo#", "#ooo#ooo#", "#ooo#ooo#", "#ooooooo#", "#ooo#ooo#", "#ooooooo#", "#########"],
    "pause": ["###.###"] * 9,
    "play": ["#......", "##.....", "###....", "####...", "#####..", "####...", "###....", "##.....", "#......"],
    "plus": ["...###...", "...###...", "...###...", "#########", "#########", "#########", "...###...", "...###...", "...###..."],
    "next": ["#....", "##...", ".##..", "..##.", "...##", "..##.", ".##..", "##...", "#...."],
    "prev": ["....#", "...##", "..##.", ".##..", "##...", ".##..", "..##.", "...##", "....#"],
    "down": ["...###...", "...###...", "...###...", ".#######.", "..#####..", "...###...", "....#....", "#.......#", "#########"],
    "up": ["....#....", "...###...", "..#####..", ".#######.", "...###...", "...###...", "...###...", "#.......#", "#########"],
    "close": ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"],
    "lock": ["..###..", ".#...#.", ".#...#.", "#######", "#ooooo#", "#oo#oo#", "#oo#oo#", "#ooooo#", "#######"],
    "glass": ["#######", "#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.###.#", "#######"],
    "sun": ["....#....", ".#..#..#.", "..#####..", "...###...", "####o####", "...###...", "..#####..", ".#..#..#.", "....#...."],
    "list": ["##.######", "##.######", ".........", "##.######", "##.######", ".........", "##.######", "##.######"],
    "grid": ["###.###", "###.###", "###.###", ".......", "###.###", "###.###", "###.###"],
}


def icon_defs():
    out = ['<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>']
    for name, rows in ICONS.items():
        w, h = len(rows[0]), len(rows)
        rects = []
        for y, row in enumerate(rows):
            x = 0
            while x < len(row):
                c = row[x]
                if c in "#o":
                    x2 = x
                    while x2 < len(row) and row[x2] == c:
                        x2 += 1
                    cls = "" if c == "#" else ' fill-opacity=".32"'
                    rects.append(f'<rect{cls} x="{x}" y="{y}" width="{x2 - x}" height="1"/>')
                    x = x2
                else:
                    x += 1
        out.append(f'<symbol id="ic-{name}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">{"".join(rects)}</symbol>')
    out.append("</defs></svg>")
    return "".join(out)


def ic(name, cls="", px=None):
    rows = ICONS[name]
    w, h = len(rows[0]), len(rows)
    st = f' style="--w:{w};--h:{h}' + (f";--px:{px}px" if px else "") + '"'
    return f'<svg class="ic {cls}"{st} viewBox="0 0 {w} {h}" aria-hidden="true"><use href="#ic-{name}"/></svg>'



SCENES = [
    dict(sky=((232, 176, 150), (250, 224, 190)), sun=(255, 236, 200), hills=((126, 90, 110), (92, 62, 88), (58, 40, 66))),
    dict(sky=((92, 150, 206), (190, 222, 240)), sun=(255, 255, 250), hills=((88, 138, 92), (60, 110, 78), (36, 78, 60))),
    dict(sky=((84, 52, 96), (236, 120, 84)), sun=(255, 196, 110), hills=((60, 32, 64), (40, 22, 50), (24, 14, 34))),
    dict(sky=((14, 20, 48), (52, 60, 110)), sun=(230, 230, 210), hills=((20, 30, 52), (14, 22, 40), (8, 14, 28))),
    dict(sky=((240, 200, 140), (250, 230, 190)), sun=(255, 248, 220), hills=((214, 150, 96), (180, 112, 70), (130, 78, 52))),
    dict(sky=((150, 200, 222), (220, 236, 240)), sun=(255, 255, 240), hills=((60, 130, 160), (40, 100, 140), (24, 70, 110))),
    dict(sky=((196, 206, 214), (240, 226, 200)), sun=(255, 230, 180), hills=((196, 110, 52), (150, 72, 40), (96, 44, 34))),
    dict(sky=((176, 196, 222), (236, 242, 250)), sun=(250, 250, 255), hills=((236, 240, 246), (200, 212, 228), (150, 170, 200))),
    dict(bokeh=True, sky=((66, 38, 30), (92, 54, 40)), sun=(255, 196, 110), hills=((120, 70, 48), (96, 54, 38), (70, 38, 28))),
    dict(sky=((170, 214, 226), (230, 240, 220)), sun=(255, 252, 230), hills=((120, 170, 84), (80, 140, 70), (48, 100, 56))),
    dict(sky=((120, 30, 40), (246, 150, 90)), sun=(255, 214, 140), hills=((74, 24, 34), (50, 20, 28), (30, 12, 20))),
    dict(sky=((70, 70, 74), (190, 190, 194)), sun=(240, 240, 240), hills=((130, 130, 134), (90, 90, 94), (50, 50, 54))),
]
SIZE = 128


def _mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _scene_rgb(i, W=SIZE, H=SIZE):
    sc = SCENES[i % len(SCENES)]
    r = random.Random(1000 + i)
    cx, cy, rad = r.uniform(W * 0.2, W * 0.8), r.uniform(H * 0.2, H * 0.44), r.uniform(H * 0.07, H * 0.125)
    layers = []
    for l in range(3):
        layers.append((H * (0.52 + 0.13 * l), r.uniform(0.04, 0.09), r.uniform(0, 6.28), r.uniform(0.09, 0.15), r.uniform(0, 6.28), sc["hills"][l]))
    bokeh = [(r.uniform(0, W), r.uniform(0, H * 0.8), r.uniform(H * 0.055, H * 0.15), r.uniform(0.25, 0.7)) for _ in range(9)]
    px = bytearray()
    for y in range(H):
        for x in range(W):
            c = _mix(sc["sky"][0], sc["sky"][1], y / (H * 0.75) if y < H * 0.75 else 1)
            if sc.get("bokeh"):
                for bx, by, br, ba in bokeh:
                    d = math.hypot(x - bx, y - by)
                    if d < br:
                        c = _mix(c, sc["sun"], ba * (1 - d / br) * 0.9)
            else:
                d = math.hypot(x - cx, y - cy)
                if d < rad:
                    c = sc["sun"]
                elif d < rad * 3.2:
                    c = _mix(c, sc["sun"], 0.5 * (1 - (d - rad) / (rad * 2.2)) ** 2)
            for base, a1, p1, a2, p2, col in layers:
                edge = base - H * (a1 * math.sin(x * 0.045 * SIZE / H + p1) + a2 * math.sin(x * 0.11 * SIZE / H + p2))
                if y >= edge:
                    c = col
            n = r.randint(-4, 4)
            px += bytes(max(0, min(255, int(v + n))) for v in c)
    return bytes(px)


def thumbs():
    cache = os.path.join(HERE, ".thumbs")
    os.makedirs(cache, exist_ok=True)
    big, tiny = [], []
    for i in range(len(SCENES)):
        jp, tp = os.path.join(cache, f"{i}.jpg"), os.path.join(cache, f"{i}.png")
        if not (os.path.exists(jp) and os.path.exists(tp)):
            with tempfile.NamedTemporaryFile(suffix=".ppm", delete=False) as f:
                f.write(f"P6 {SIZE} {SIZE} 255\n".encode() + _scene_rgb(i))
                name = f.name
            subprocess.run(["magick", name, "-quality", "58", "-sampling-factor", "4:2:0", "-strip", jp], check=True)
            subprocess.run(["magick", name, "-filter", "Box", "-resize", "9x9!", "-strip", tp], check=True)
            os.unlink(name)
        big.append("data:image/jpeg;base64," + b64(jp))
        tiny.append("data:image/png;base64," + b64(tp))
    return big, tiny


def bigs_css():
    cache = os.path.join(HERE, ".thumbs")
    css = []
    for i in (2, 5, 9, 4):
        p = os.path.join(cache, f"big{i}.jpg")
        if not os.path.exists(p):
            with tempfile.NamedTemporaryFile(suffix=".ppm", delete=False) as f:
                f.write(b"P6 480 320 255\n" + _scene_rgb(i, 480, 320))
                name = f.name
            subprocess.run(["magick", name, "-quality", "60", "-strip", p], check=True)
            os.unlink(name)
        css.append(f".b{i}{{background-image:url(data:image/jpeg;base64,{b64(p)})}}")
    return "\n".join(css)


def thumbs_css():
    big, tiny = thumbs()
    css = [".tn{background-size:cover;background-position:center;background-color:#4a2b2c}",
           ".pxl{background-size:100% 100%;image-rendering:pixelated;background-color:#4a2b2c}"]
    for i, (b, t) in enumerate(zip(big, tiny)):
        css.append(f".t{i}{{background-image:url({b})}}.p{i}{{background-image:url({t})}}")
    return "\n".join(css)



HEIC = {1, 4, 6, 9, 13, 17, 19, 22, 25, 28, 33, 40}
VIDEOS = {7: ("MOV", 118, "0:41"), 15: ("MOV", 342, "2:08"), 18: ("MOV", 3100, "19:30"), 26: ("MOV", 486, "3:02"), 38: ("MP4", 212, "1:12")}
PART_MB = 16
NFILES = 46
BATCH_DAY = "2026-11-26"


def batch():
    r = random.Random(77)
    files = []
    for i in range(NFILES):
        if i in VIDEOS:
            ext, mb, dur = VIDEOS[i]
            kind = "video"
        else:
            ext = "HEIC" if i in HEIC else "JPG"
            mb, dur = round(r.uniform(1.8, 5.6), 1), ""
            kind = "heic" if i in HEIC else "photo"
        files.append(dict(i=i, name=f"IMG_{4012 + i}.{ext}", ext=ext, kind=kind, mb=float(mb), dur=dur,
                          scene=(i * 5 + 3) % len(SCENES), parts=max(1, math.ceil(mb / PART_MB))))
    return files


def mbtext(mb):
    return f"{mb / 1024:.1f} GB" if mb >= 1000 else (f"{mb:.0f} MB" if mb >= 10 else f"{mb:.1f} MB")


SPEED = 6.2


def scenario(name):
    fs = batch()
    for f in fs:
        f.update(state="waiting", frac=0.0, note="")
    S = lambda i, st, fr=0.0, note="": fs[i].update(state=st, frac=fr, note=note)
    if name == "ready":
        return fs, dict(banner=None)
    if name in ("sending", "paused", "away"):
        ndone = 17 if name == "sending" else 18
        for i in range(ndone):
            S(i, "done", 1.0)
        st = {"sending": "sending", "paused": "paused", "away": "resuming"}[name]
        for i, fr in ((ndone, 0.62), (ndone + 1, 0.07), (ndone + 2, 0.18)):
            S(i, st, fr)
        S(18, st, 0.41)
        return fs, dict(banner=name)
    if name == "reload":
        for i in range(18):
            S(i, "done", 1.0)
        for i in (18, 19, 20):
            S(i, "memo", 0.4, "part-way")
        for i in range(21, NFILES):
            S(i, "memo", 0.0, "not started")
        return fs, dict(banner="reload")
    if name == "problem":
        for i in range(NFILES):
            S(i, "done", 1.0)
        S(18, "failed", 0.58, "stopped")
        S(25, "failed", 0.0, "busy")
        S(44, "refused", 0.0, "gif")
        fs[44].update(name="Dancing.gif", ext="GIF", kind="photo", mb=1.4)
        return fs, dict(banner="problem")
    if name == "done":
        for i in range(NFILES):
            S(i, "done", 1.0)
        return fs, dict(banner="done")
    raise KeyError(name)


def totals(fs):
    total = sum(f["mb"] for f in fs)
    done = sum(f["mb"] * (1.0 if f["state"] == "done" else f["frac"] if f["state"] in ("sending", "paused", "resuming", "failed") else 0.0) for f in fs)
    n = sum(1 for f in fs if f["state"] == "done")
    left_min = max(1, round((total - done) / SPEED / 60))
    return dict(total=total, done=done, n=n, pct=done / total if total else 0, left_min=left_min)



UPLOAD_SCREENS = [("u-ready", "ready"), ("u-sending", "sending"), ("u-paused", "paused"), ("u-away", "away"),
                  ("u-reload", "reload"), ("u-problem", "problem"), ("u-done", "done")]
FILES_SCREENS = [("f-root", "root"), ("f-folder", "folder"), ("f-photo", "photo"), ("f-heic", "heic"),
                 ("f-video", "video"), ("f-pdf", "pdf"), ("f-empty", "empty")]


def harness_css():
    rules = []
    for sid, _ in UPLOAD_SCREENS + FILES_SCREENS:
        rules.append(f'body:has(#{sid}:target) .mk-bar a[href="#{sid}"]{{background:#e9c46a;color:#1b1410}}')
    rules.append('body:not(:has(.screen:target)) .mk-bar a[href="#u-ready"]{background:#e9c46a;color:#1b1410}')
    return ".screen{display:none}.screen:target{display:block}body:not(:has(.screen:target)) .screen.default{display:block}\n" + "\n".join(rules)


MK_CSS = """
.mk-bar{position:relative;z-index:9999;background:#15110f;color:#e9e1d8;font:12px/1.2 system-ui,sans-serif;padding:6px 8px 7px;border-bottom:1px solid #000}
.mk-bar b{display:inline-block;margin:0 6px 0 0;color:#b9a99a;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:10px}
.mk-row{display:flex;gap:4px;align-items:center;overflow-x:auto;white-space:nowrap;padding:2px 0;scrollbar-width:none}
.mk-row::-webkit-scrollbar{display:none}
.mk-bar a,.mk-bar button{flex:none;color:#e9e1d8;background:#2a221d;border:1px solid #3d332b;border-radius:3px;padding:4px 8px;text-decoration:none;font:inherit;cursor:pointer}
.mk-bar a:hover,.mk-bar button:hover{background:#3d332b}
.mk-name{color:#e9c46a;font-weight:700;margin-right:6px}
.from{position:relative;z-index:9998;background:#15110f;color:#b9a99a;font:12px/1.45 system-ui,sans-serif;padding:8px 12px 10px;border-top:1px solid #000;clear:both}
.from b{color:#e9c46a;font-weight:600}
.from a{color:#e9e1d8}
body.shot .mk-bar,body.shot .from{display:none!important}
"""

MK_JS = """
(function(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');
if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();location.hash=a.getAttribute('href').slice(1);});
var q=new URLSearchParams(location.search);
if(q.has('shot'))document.body.classList.add('shot');
var s=q.get('scheme');if(s)document.documentElement.setAttribute('data-scheme',s);
var b=document.getElementById('mk-scheme');if(b)b.addEventListener('click',function(){var d=document.documentElement,c=d.getAttribute('data-scheme');
var dark=c?c==='dark':matchMedia('(prefers-color-scheme: dark)').matches;d.setAttribute('data-scheme',dark?'light':'dark');});})();
"""


def harness_bar(name, links):
    up = "".join(f'<a href="#{sid}">{label}</a>' for sid, label in UPLOAD_SCREENS)
    fl = "".join(f'<a href="#{sid}">{label}</a>' for sid, label in FILES_SCREENS)
    other = "".join(f'<a href="{href}">{label}</a>' for href, label in links)
    return (f'<nav class="mk-bar" aria-label="Mockup states"><div class="mk-row"><span class="mk-name">{name}</span>{other}'
            f'<button id="mk-scheme" type="button">paper / stage</button></div>'
            f'<div class="mk-row"><b>upload</b>{up}</div><div class="mk-row"><b>files</b>{fl}</div></nav>')


def from_note(items):
    parts = " &nbsp;·&nbsp; ".join(f'<a href="moodboard.html#{a}">{l}</a>: {t}' for l, a, t in items)
    return f'<aside class="from"><b>from:</b> {parts}</aside>'


def page(title, name, css, body, scheme=None, links=()):
    attr = f' data-scheme="{scheme}"' if scheme else ""
    return (f'<!doctype html>\n<html lang="en"{attr} class="rotolo">\n<head>\n<meta charset="utf-8">\n'
            f'<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>{title}</title>\n'
            f'<style>\n{fonts_css()}\n{zanni_css()}\n{thumbs_css()}\n{bigs_css()}\n{harness_css()}\n{MK_CSS}\n{css}\n</style>\n</head>\n<body class="gesso">\n'
            f'{icon_defs()}\n{harness_bar(name, links)}\n{body}\n<script>{MK_JS}</script>\n</body>\n</html>\n')


def parts_text(f):
    n = max(1, f["parts"])
    return max(1, min(n, int(f["frac"] * n) + 1)), n


def say(f):
    st, kind = f["state"], f["kind"]
    done_mb = f["frac"] * f["mb"]
    if st == "done":
        return "Saved"
    if st == "waiting":
        return "Waiting"
    if st == "sending":
        if f["parts"] > 1:
            p, n = parts_text(f)
            return f"Sending part {p} of {n}"
        return f"Sending {mbtext(done_mb)} of {mbtext(f['mb'])}"
    if st == "paused":
        return f"Paused at {round(f['frac'] * 100)}%"
    if st == "resuming":
        if f["parts"] > 1:
            p, n = parts_text(f)
            return f"Carrying on at part {p} of {n}"
        return "Checking what was saved"
    if st == "failed":
        if f["note"] == "stopped":
            p, n = parts_text(f)
            return f"Stopped at part {p - 1} of {n}. Connection lost."
        return "Storage was busy. Nothing is lost."
    if st == "refused":
        return f"Can't upload {f['ext']} files here."
    if st == "memo":
        if f["note"] == "part-way" and f["parts"] > 1:
            p, n = parts_text(f)
            return f"Carries on at part {p} of {n}"
        if f["note"] == "part-way":
            return "Part-way, starts again"
        return "Not started"
    return ""
