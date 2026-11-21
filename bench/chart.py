import glob
import html
import json
import os
import sys

from check import pick

here = os.path.dirname(os.path.abspath(__file__))
W, H, PAD = 320, 140, 28


def spark(path, runs, budget):
    pts = [(i, pick(r, path)) for i, r in enumerate(runs)]
    pts = [(i, v) for i, v in pts if isinstance(v, (int, float))]
    vals = [v for _, v in pts]
    if budget:
        vals.append(budget["budget"] * (1 + budget.get("margin", 0.1)) + budget.get("slack", 0))
    top = max(vals or [1]) * 1.1 or 1
    x = lambda i: PAD + (W - 2 * PAD) * (i / max(1, len(runs) - 1))
    y = lambda v: H - PAD - (H - 2 * PAD) * (v / top)
    parts = ['<svg viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H), '<line x1="%d" y1="%d" x2="%d" y2="%d" class="axis"/>' % (PAD, H - PAD, W - PAD, H - PAD)]
    if budget:
        b = budget["budget"]
        lim = b * (1 + budget.get("margin", 0.1)) + budget.get("slack", 0)
        parts.append('<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" class="budget"/>' % (PAD, y(b), W - PAD, y(b)))
        parts.append('<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" class="limit"/>' % (PAD, y(lim), W - PAD, y(lim)))
    if pts:
        parts.append('<polyline points="%s"/>' % " ".join("%.1f,%.1f" % (x(i), y(v)) for i, v in pts))
        for i, v in pts:
            parts.append('<circle cx="%.1f" cy="%.1f" r="3"><title>%s %s: %s</title></circle>' % (x(i), y(v), html.escape(runs[i]["date"][:10]), html.escape(runs[i]["sha"]), v))
        parts.append('<text x="%d" y="14">%s</text>' % (PAD, html.escape("%g" % pts[-1][1])))
    parts.append("</svg>")
    return "".join(parts)


def main():
    results = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "results")
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "chart.html")
    runs = sorted((json.load(open(f)) for f in glob.glob(os.path.join(results, "*.json"))), key=lambda r: r["date"])
    budgets = json.load(open(os.path.join(here, "budgets.json")))["metrics"]
    cells = "".join('<figure>%s<figcaption>%s</figcaption></figure>' % (spark(p, runs, b), html.escape(p)) for p, b in sorted(budgets.items()))
    rows = "".join("<li>%s %s</li>" % (html.escape(r["date"]), html.escape(r["sha"])) for r in runs)
    doc = """<!doctype html><meta charset="utf-8"><title>figchat perf</title>
<style>body{font:13px/1.4 ui-monospace,monospace;margin:24px;background:#fbf8f1;color:#222}figure{display:inline-block;margin:6px;border:1px solid #ddd;background:#fff}
figcaption{padding:2px 6px}polyline{fill:none;stroke:#7a2e1d;stroke-width:2}circle{fill:#7a2e1d}.axis{stroke:#999}.budget{stroke:#2d6a3e;stroke-dasharray:4 3}.limit{stroke:#b33;stroke-dasharray:2 3}text{font-size:12px}</style>
<h1>figchat perf</h1><p>%d runs. Green dashes: budget. Red dots: budget plus margin, where the check fails.</p>%s<ol>%s</ol>
""" % (len(runs), cells, rows)
    open(out, "w").write(doc)
    print(out)


if __name__ == "__main__":
    main()
