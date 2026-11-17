import json
from functools import reduce
from math import gcd
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

here = __file__.rsplit("/", 1)[0]
faces = json.load(open(here + "/faces.json"))
titles = json.load(open(here + "/titles.json"))

LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
DIGITS = "0123456789"
PUNCT = "".join(chr(c) for c in range(33, 127) if not chr(c).isalnum())
ACCENTS = "àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿœßÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝŒ"
TYPO = "·…–—‘’“”→←↑↓×±°•"
COCKPIT = "".join(sorted(set("".join(titles) + "Tokens / s Throughput 0123456789.%$:,-()#+→·")))


def grid_module(font, cmap):
    gs = font.getGlyphSet()
    coords = []
    for ch in LETTERS + DIGITS:
        g = cmap.get(ord(ch))
        if not g:
            continue
        if "glyf" in font:
            gl = font["glyf"][g]
            if gl.numberOfContours > 0:
                pts, _, _ = gl.getCoordinates(font["glyf"])
                coords += [abs(v) for p in pts for v in p]
        else:
            from fontTools.pens.recordingPen import RecordingPen
            rp = RecordingPen()
            gs[g].draw(rp)
            for _, args in rp.value:
                for a in args:
                    coords += [abs(v) for v in a]
    coords = [int(round(c)) for c in coords if c]
    return reduce(gcd, coords)


def cover(cmap, chars):
    have = [c for c in chars if ord(c) in cmap]
    return len(have), len(chars), "".join(c for c in chars if ord(c) not in cmap)


out = {}
for f in faces:
    font = TTFont(here + "/" + f.get("full", f["file"]))
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    mod = grid_module(font, cmap)
    if mod < 16:
        mod = upm / f["native"]
    gs = font.getGlyphSet()

    def top(ch):
        bp = BoundsPen(gs)
        gs[cmap[ord(ch)]].draw(bp)
        return bp.bounds

    out[f["id"]] = {
        "upm": upm,
        "module": mod,
        "grid_em": round(upm / mod, 2),
        "x_rows": round(top("x")[3] / mod, 1),
        "cap_rows": round(top("H")[3] / mod, 1),
        "asc_rows": round(top("l")[3] / mod, 1),
        "desc_rows": round(-top("p")[1] / mod, 1),
        "x_ratio": round(top("x")[3] / upm, 3),
        "glyphs": len(font.getGlyphOrder()),
        "cmap": len(cmap),
        "letters": cover(cmap, LETTERS),
        "digits": cover(cmap, DIGITS),
        "punct": cover(cmap, PUNCT),
        "accents": cover(cmap, ACCENTS),
        "typo": cover(cmap, TYPO),
        "cockpit_missing": cover(cmap, COCKPIT)[2],
        "pack_file_bytes": __import__("os").path.getsize(here + "/" + f["file"]),
    }
    if "full" in f:
        pk = TTFont(here + "/" + f["file"]).getBestCmap()
        out[f["id"]]["pack_cmap"] = len(pk)
        out[f["id"]]["pack_accents"] = cover(pk, ACCENTS)[:2]
        out[f["id"]]["pack_punct"] = cover(pk, PUNCT)[:2]
json.dump(out, open(here + "/static.json", "w"), indent=1, ensure_ascii=False)
for k, v in out.items():
    print(k, v["grid_em"], v["x_rows"], v["cap_rows"], v["letters"][:2], v["digits"][:2], v["punct"], v["accents"][:2], v["typo"][:2], "missing in cockpit set:", repr(v["cockpit_missing"]))
