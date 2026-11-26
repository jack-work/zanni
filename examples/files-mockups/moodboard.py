import base64
import os
import subprocess

from lib import ICONS, fonts_css, ic, icon_defs, zanni_css

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = "/tmp/research/shots"
CACHE = os.path.join(HERE, ".thumbs")

LOG_PATH = "~/.captains-log/2026/11/26/finding-current-design-references.md"

REFS = [
    dict(id="immich", name="Immich v3 (live demo)", url="https://demo.immich.app/", kind="product", imgs=["immich-timeline-m", "immich-viewer-m", "immich-timeline-d"],
         date="Latest release v3.4.2 on 2026-11-18 (GitHub releases API). v3.1.0, 2026-07-29, added a web wake lock for uploads.",
         take="Date-headed timeline with tiles packed edge to edge. A viewer that gives the picture the whole screen and keeps actions in one icon row. The screen is kept awake while uploads run.",
         skip="Left rail and search-first chrome: too much for one person with one job.",
         used="Provino (grid, viewer), Copione and Sipario (wake lock line)"),
    dict(id="ente", name="Ente Photos", url="https://ente.com/help/photos/changelog", kind="product", imgs=["ente-changelog-m"],
         date="Changelog lists v1.3.70 (mobile), Nov 2026, with entries for a redesigned upload completion dialog and stop-upload dialog.",
         take="Upload as a compact card that expands. Four sections: In progress, Completed, Skipped, Failed. Stop, then pick the same files again: finished files are skipped and only the rest goes up.",
         skip="Encryption language. Albums as the unit: ours is plain folders.",
         used="Copione (sections), Sipario (the 'carry on' wording), all three (re-pick after a closed page)"),
    dict(id="dropbox", name="Dropbox iOS upload sheet (via Mobbin)", url="https://mobbin.com/explore/screens/0344b16a-a8e5-442b-a8f9-efddae1ab159", kind="product screen", imgs=["mobbin-dropbox-screen-m"],
         date="The Mobbin screen is undated. Dropbox's own release notes run to Nov 2026, so the app is current, but treat this as a pattern, not a 2026 capture.",
         take="Header that says how many items and how long is left. Thumbnail rows with a hairline bar under the active one. Two plain buttons at the top: Upload photos, Upload file.",
         skip="The unlabeled paperclip and overflow icons on each row.",
         used="Copione (rows), Sipario (count and time left)"),
    dict(id="dropbox-new", name="Dropbox, the new Dropbox experience", url="https://dropbox.tech/machine-learning/how-aiassisted-development-helped-us-build-the-new-dropbox-experience", kind="article", imgs=["dropbox-tech-new-m"],
         date="Published 2026-11-05 (publishDate meta tag).",
         take="Evidence that a large drive just moved to Home and Library with previews, and kept an upload action always in reach.",
         skip="The AI-assisted build story.",
         used="Copione (Upload stays in the bar)"),
    dict(id="uppy", name="Uppy Dashboard 6", url="https://uppy.io/docs/dashboard/", kind="component", imgs=["uppy-docs-dashboard-d"],
         date="Page footer 2016-2026, Last-Modified 2026-11-26. Uppy 6.0 blog post and @uppy/dashboard 6.0.3 on npm.",
         take="One overall status bar with pause, resume, cancel. Add more files while it runs. The Golden Retriever plugin: restore the queue after a reload. A thumbnail generator that makes small copies in the browser.",
         skip="The plugin sprawl and sources like webcam and Dropbox.",
         used="Copione and Sipario (overall bar, pause), Provino (phone-made thumbnails)"),
    dict(id="filepond", name="FilePond", url="https://pqina.nl/filepond/", kind="component", imgs=["filepond-m"],
         date="Last-Modified 2026-02-24. FilePond 5 Beta is announced on the page.",
         take="A status word under the file name and nothing else.",
         skip="The pill-shaped drop target.",
         used="Copione (status line)"),
    dict(id="untitledui", name="Untitled UI file uploaders", url="https://www.untitledui.com/react/components/file-uploaders", kind="component", imgs=["untitledui-uploaders-demo-d"],
         date="Page is undated. Install command is npx untitledui@latest, so the code is current; the look is the 2024 to 2026 SaaS default.",
         take="A failed row that stands apart: red outline, the word Failed, and a plain Try again. File type badge and percent label per row.",
         skip="Everything else: it is the template look zanni is meant to avoid.",
         used="Copione and Sipario (failed row), Provino (state badge on a tile)"),
    dict(id="coss", name="coss.com origin, file upload", url="https://coss.com/origin/file-upload", kind="component", imgs=["coss-origin-variants-m"],
         date="Footer 2026, and the page calls itself a new library built on Base UI.",
         take="An image grid with an 'Uploaded files (4)' header and an Add more button. Frames instead of a list.",
         skip="Round remove buttons on every tile.",
         used="Provino (the sheet of frames)"),
    dict(id="nuxtui", name="Nuxt UI FileUpload", url="https://ui.nuxt.com/docs/components/file-upload", kind="component", imgs=["nuxtui-progress-d"],
         date="Last-Modified 2026-11-25; page time stamps 2026-11-16, 2026-10-15.",
         take="A real file input underneath, so a phone's own picker opens. An example that turns chosen files into items with progress and previews.",
         skip="Docs layout.",
         used="all three (the native picker stays)"),
    dict(id="twentyfirst", name="21st.dev, file uploads in React", url="https://21st.dev/blog/react-file-upload-components", kind="article", imgs=["21st-blog-upload-m"],
         date="Published 2026-08-20 (article:published_time).",
         take="The point that most components skip the after state: what the uploaded set looks like once it exists, with per-file status. A large-file card is its own case.",
         skip="The component catalogue itself: a sign-in wall stands in front of most of it.",
         used="Provino and Sipario (a designed done screen)"),
    dict(id="saasframe", name="SaaSFrame, empty state examples", url="https://www.saasframe.io/categories/empty-state", kind="gallery", imgs=["saasframe-empty-m"],
         date="Page title says 'in 2026', footer 2026.",
         take="An empty screen names the next action in plain verbs, with one button.",
         skip="Illustration-led empty states.",
         used="all three (the empty folder)"),
    dict(id="eleken", name="Eleken, designing a file upload UI in 2026", url="https://www.eleken.co/blog-posts/file-upload-ui", kind="article", imgs=["eleken-upload-m"],
         date="Published 18 Feb 2026 (datePublished in JSON-LD).",
         take="Progress per file and not only per batch. Errors next to the file, with a summary on top. Determinate bars with a percent label.",
         skip="The illustrations.",
         used="Copione and Sipario (summary above, errors beside the file)"),
    dict(id="gdrive", name="Google Drive, Material 3 Expressive", url="https://9to5google.com/2026/01/06/google-drive-m3-expressive-redesign-complete/", kind="article", imgs=["9to5-drive-m3e-m"],
         date="Published 2026-01-06 (article:published_time).",
         take="Container-style layout: groups sit in their own containers, and the whole screen reads as a few big shapes.",
         skip="Pill and blob radii. Ours stay hard-edged and pixel stepped.",
         used="Sipario (grouped containers), Copione (folders as a row type)"),
    dict(id="gphotos", name="Google Photos, 2026 redesigns", url="https://9to5google.com/2026/10/26/google-photos-collections-redesign/", kind="article", imgs=["9to5-photos-hero-m"],
         date="Collections redesign 2026-10-27; floating toolbar 2026-02 (androidheadlines).",
         take="A Collections tab you can arrange, newest first, as cards with a cover. A persistent floating toolbar for the main actions.",
         skip="The customization settings. One person, one folder.",
         used="Provino (floating Upload), Sipario (cards, bottom sheet)"),
    dict(id="ios26", name="iOS 26 Photos (still current in iOS 27)", url="https://www.macstories.net/stories/ios-and-ipados-26-the-macstories-review/16/", kind="article", imgs=["macstories-photos-shots-m"],
         date="MacStories review 2025-09-15, so over a year old. 9to5Mac, 2026-11-04: iOS 27 'doesn't contain any big changes to the design of the Photos app'. Kept because it is the layout her phone already uses.",
         take="A grid library with a bottom bar that separates Library from Collections. Controls reachable by thumb.",
         skip="Liquid Glass translucency: it fights the gesso paper.",
         used="Provino and Sipario (bottom bar, grid as home)"),
    dict(id="retro", name="Setproduct, retro and brutalist UI 2026", url="https://www.setproduct.com/blog/retro-brutalist-ui-design-2026", kind="article", imgs=["setproduct-retro-m"],
         date="Published 2026-06-05 (JSON-LD and meta).",
         take="Evidence that pixel icons, title bars, beveled buttons and dotted focus rectangles are a current direction, not only zanni's. Used for the dotted focus ring and the stepped arch.",
         skip="Windows 98 windows and drag handles.",
         used="all three"),
    dict(id="linear", name="Linear", url="https://linear.app/", kind="product", imgs=["linear-home-d"],
         date="Live page: 'The product development system for teams and agents', 'Designed for the AI era'. A third-party note dates a visual refresh to March 2026.",
         take="Quiet chrome, colour spent only on state, one primary action per screen.",
         skip="Near-black SaaS look: one of the three defaults the brief says to avoid.",
         used="Sipario (one action), Copione (colour means state)"),
]

TOOLS = [
    ("Mobbin", "https://mobbin.com/explore/mobile/screens/upload-download", "Real shipped screens by pattern. Thumbnails and titles are free to read; full flows sit behind a login."),
    ("SaaSFrame", "https://www.saasframe.io/patterns/file-uploader", "95 file uploader examples and 186 empty states, tagged by pattern, with 2026 in the page titles. Cookie banner covers the first screen."),
    ("Refero", "https://refero.design/", "68k screens and flows. Search shows results only after sign-in."),
    ("Awwwards, UI design", "https://www.awwwards.com/websites/ui-design/", "Good for type and motion ideas, thin on product UI. Filter by year before trusting a card."),
    ("Page Flows", "https://pageflows.com/web/screens/upload-file/", "Upload flows recorded as video. Paid to open."),
    ("Dribbble tags", "https://dribbble.com/tags/cloud-storage", "Concepts, not shipped UI, and the page is bot-walled. Skipped."),
    ("21st.dev, shadcnblocks, coss", "https://21st.dev/s/upload-download", "Component showcases with a live preview and the code. Date comes from the repo or the footer."),
    ("Raycast", "https://www.raycast.com/", "Captured and set aside: a marketing page, no file UI."),
]

CSS = """
.m-wrap{max-width:1120px;margin:0 auto;padding:18px 16px 60px;font-size:19px;line-height:1.5}
.ic{display:inline-block;width:calc(var(--w) * var(--px,3px));height:calc(var(--h) * var(--px,3px));fill:currentColor;flex:none;vertical-align:middle}
.m-mast{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;border-bottom:2px solid var(--z-ink);background:var(--z-ground)}
.m-mark{font:30px/1 var(--fontpack-display);letter-spacing:.06em;color:var(--z-ink);text-decoration:none}
.m-nav{display:flex;gap:6px}
.m-nav a{display:inline-flex;align-items:center;min-height:44px;padding:4px 12px 2px;border:3px solid var(--z-ink);color:var(--z-ink);text-decoration:none;font:21px/1 var(--fontpack-mono);letter-spacing:.06em}
.m-nav a:hover{background:var(--z-tint)}
h1{margin:10px 0 4px;font:400 46px/1.1 var(--fontpack-display);letter-spacing:.04em}
.lede{margin:0 0 18px;color:var(--z-muted);max-width:44rem}
h2{margin:30px 0 10px;font:400 24px/1 var(--fontpack-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--z-muted);display:flex;gap:10px;align-items:baseline}
h2::after{content:"";flex:1;border-bottom:2px dotted var(--z-line)}
.card{display:grid;gap:14px;margin:0 0 18px;padding:14px;border:3px solid var(--gold);background:var(--z-ground-2);scroll-margin-top:12px}
.card:target{outline:4px solid var(--z-focus);outline-offset:3px}
.card h3{margin:0;font:400 30px/1.1 var(--fontpack-display);letter-spacing:.04em}
.card .k{font:18px/1 var(--fontpack-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--z-muted)}
.shots{display:flex;gap:10px;overflow-x:auto;align-items:flex-start;padding-bottom:6px}
.shots img{display:block;height:300px;width:auto;border:2px solid var(--z-ink);background:#fff}
.shots img.d{height:240px}
.nostill{padding:10px 12px;border:2px dashed var(--z-line);font:18px/1.35 var(--fontpack-mono);color:var(--z-muted)}
dl{margin:0;display:grid;grid-template-columns:5.6rem 1fr;gap:6px 12px}
dt{font:19px/1.5 var(--fontpack-mono);letter-spacing:.06em;color:var(--z-muted);text-transform:uppercase}
dd{margin:0}
dd.url{font:18px/1.4 var(--fontpack-mono);word-break:break-all}
.pill{display:inline-block;margin:0 4px 0 0;padding:0 6px;border:2px solid var(--z-accent);color:var(--z-accent);font:17px/1.3 var(--fontpack-mono)}
table{width:100%;border-collapse:collapse;font-size:18px}
td,th{padding:8px 10px;border-bottom:1px solid var(--z-line);text-align:left;vertical-align:top}
th{font:17px/1 var(--fontpack-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--z-muted)}
td.n{white-space:nowrap}
.how{padding:14px;border:3px solid var(--z-line);background:var(--z-ground-2)}
.how p{margin:0 0 8px}
@media (min-width:900px){.card{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:start}.card .head{grid-column:1/-1}.shots img{height:340px}.shots img.d{height:270px}}
"""


def thumb(slug):
    os.makedirs(CACHE, exist_ok=True)
    src = os.path.join(SHOTS, slug + ".png")
    out = os.path.join(CACHE, "mb-" + slug + ".jpg")
    d = slug.endswith("-d")
    if not os.path.exists(out):
        subprocess.run(["magick", src, "-resize", "760x" if d else "340x", "-quality", "58", "-strip", out], check=True)
    with open(out, "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode(), d


def card(r, stills):
    imgs = []
    for s in r["imgs"]:
        if stills:
            uri, d = thumb(s)
            imgs.append(f'<img{" class=d" if d else ""} src="{uri}" alt="Capture of {r["name"]}">')
        else:
            imgs.append(f'<div class="nostill">capture <code>refs/{s}.png</code>, kept off the public mirror</div>')
    used = "".join(f'<span class="pill">{u.strip()}</span>' for u in r["used"].split("),")) if False else r["used"]
    return (f'<article class="card" id="{r["id"]}"><div class="head"><div class="k">{r["kind"]}</div><h3>{r["name"]}</h3></div>'
            f'<div class="shots">{"".join(imgs)}</div><dl>'
            f'<dt>Link</dt><dd class="url"><a href="{r["url"]}">{r["url"]}</a></dd>'
            f'<dt>Dated</dt><dd>{r["date"]}</dd><dt>Take</dt><dd>{r["take"]}</dd><dt>Skip</dt><dd>{r["skip"]}</dd><dt>Used in</dt><dd>{used}</dd></dl></article>')


def build(stills=False):
    cards = "".join(card(r, stills) for r in REFS)
    tools = "".join(f'<tr><td class="n"><a href="{u}">{n}</a></td><td>{t}</td></tr>' for n, u, t in TOOLS)
    body = (f'{icon_defs()}<header class="m-mast"><a class="m-mark" href="moodboard.html">files</a><nav class="m-nav">'
            f'<a href="copione.html">copione</a><a href="provino.html">provino</a><a href="sipario.html">sipario</a></nav></header>'
            f'<main class="m-wrap"><h1>Moodboard</h1><p class="lede">Current (2026) file, photo and upload interfaces, captured on 2026-11-26. '
            f'Each mockup screen carries a small <b>from:</b> note that links to the card here. This copy carries links, dates and notes only: keel mirrors every branch to public GitHub, so the third-party stills stay in a local file, <code>moodboard-local.html</code>.</p>'
            f'<h2>Sources, {len(REFS)}</h2>{cards}<h2>Where to look</h2><table><tbody>{tools}</tbody></table>'
            f'<h2>How these were found</h2><div class="how"><p>Brave searches for the pattern name plus the year, then a headless browser at 390 and 1280 wide, reading the date '
            f'from HTTP Last-Modified, article meta tags, JSON-LD, release APIs and page footers before keeping a source.</p>'
            f'<p>Method and queries: <code>{LOG_PATH}</code> in the captains-log.</p></div></main>')
    return (f'<!doctype html>\n<html lang="en" class="rotolo">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>Moodboard: current file and upload UIs</title>\n<style>\n{fonts_css()}\n{zanni_css()}\n{CSS}\n</style>\n</head>\n<body class="gesso">\n{body}\n</body>\n</html>\n')
