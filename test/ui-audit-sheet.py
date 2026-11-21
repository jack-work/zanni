"""Build the UI audit contact sheet: every shot, before and after, with its findings.

usage: python3 test/ui-audit-sheet.py AUDITDIR

Reads AUDITDIR/before/*.png, AUDITDIR/after/*.png (optional), AUDITDIR/findings.json
and AUDITDIR/pager/*.txt; writes AUDITDIR/sheet/index.html with the images beside it.
"""
import html
import json
import os
import shutil
import sys

base = os.path.abspath(sys.argv[1])
sheet = os.path.join(base, "sheet")
os.makedirs(sheet, exist_ok=True)
findings = json.load(open(os.path.join(base, "findings.json")))
before = sorted(f for f in os.listdir(os.path.join(base, "before")) if f.endswith(".png"))
after_dir = os.path.join(base, "after")
after = set(f for f in os.listdir(after_dir) if f in before) if os.path.isdir(after_dir) else set()

for kind, names in (("before", before), ("after", sorted(after))):
    os.makedirs(os.path.join(sheet, kind), exist_ok=True)
    for f in names:
        shutil.copy2(os.path.join(base, kind, f), os.path.join(sheet, kind, f))

esc = html.escape
by_shot = {}
for f in findings:
    for s in f.get("shots", []):
        by_shot.setdefault(s, []).append(f)

STATUS = {"fixed": "fixed", "open": "open", "partial": "partial", "": ""}
rows = []
for f in findings:
    st = f.get("status", "")
    rows.append("<tr id='%s'><td>%s</td><td>%s</td><td><b>%s</b><br><span class=w>%s</span></td><td>%s</td><td>%s</td><td class='st %s'>%s</td></tr>" % (
        esc(f["id"]), esc(f["id"]), esc(f["pri"]), esc(f["title"]), esc(f.get("where", "")), esc(f.get("measured", "")), esc(f.get("fix", "")), esc(st), esc(STATUS.get(st, st))))

groups = {}
for s in before:
    view = s.split("-")[0]
    groups.setdefault(view, []).append(s)

cards = []
for view, shots in groups.items():
    cards.append("<h2>%s</h2>" % esc(view))
    for s in shots:
        imgs = "<figure><figcaption>before</figcaption><a href='before/%s'><img loading=lazy src='before/%s'></a></figure>" % (s, s)
        if after:
            imgs += ("<figure><figcaption>after</figcaption><a href='after/%s'><img loading=lazy src='after/%s'></a></figure>" % (s, s)) if s in after else "<figure><figcaption>after: not taken</figcaption></figure>"
        notes = "".join("<li><a href='#%s'>%s</a> <span class='p %s'>%s</span> %s%s</li>" % (esc(f["id"]), esc(f["id"]), esc(f["pri"]), esc(f["pri"]), esc(f["title"]), (" <span class='st %s'>%s</span>" % (esc(f.get("status", "")), esc(f.get("status", "")))) if f.get("status") else "") for f in by_shot.get(s, []))
        cards.append("<section class=card><h3>%s</h3><div class=imgs>%s</div><ul>%s</ul></section>" % (esc(s[:-4]), imgs, notes or "<li class=quiet>no finding</li>"))

pager = ""
pdir = os.path.join(base, "pager")
if os.path.isdir(pdir):
    for f in sorted(os.listdir(pdir)):
        if f.endswith(".txt"):
            pager += "<h3>%s</h3><pre>%s</pre>" % (esc(f), esc(open(os.path.join(pdir, f)).read()))

page = """<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>
<title>figaro web UI audit</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;margin:16px;background:#faf7f2;color:#222}
table{border-collapse:collapse;width:100%%;margin-bottom:24px}td{border-top:1px solid #ccc;padding:6px;vertical-align:top}
.w{font:12px ui-monospace,monospace;color:#555}
.card{border:1px solid #ccc;background:#fff;margin:12px 0;padding:8px;display:grid;grid-template-columns:auto minmax(16rem,1fr);gap:12px}.card h3{grid-column:1/-1;margin:0}.card ul{margin:0}
.imgs{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0}figcaption{font-size:12px;color:#666}
img{max-height:640px;max-width:100%%;border:1px solid #ddd}
.p{font-weight:700}.P0{color:#b00}.P1{color:#a60}.P2{color:#666}
.st.fixed{color:#070;font-weight:700}.st.open{color:#b00}.st.partial{color:#a60}
.quiet{color:#999}pre{font-size:11px;background:#eee;padding:8px;overflow:auto}
</style>
<h1>figaro web (zanni v0.32.9) UI audit</h1>
<p>390x844 is a phone context (touch, coarse pointer, DPR 3); 1280x800 is a desktop context. Mock door with deterministic data; reduced motion for stable frames. %d findings. %s</p>
<table><tr><th>id</th><th>pri</th><th>what / where</th><th>measured</th><th>fix</th><th>status</th></tr>%s</table>
%s
<h2>pager reference (tmux capture-pane)</h2>%s
""" % (len(findings), "Before and after side by side." if after else "Before set only.", "".join(rows), "".join(cards), pager)
open(os.path.join(sheet, "index.html"), "w").write(page)
print(os.path.join(sheet, "index.html"))
