import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import copione

OUT = {"copione.html": copione.build}

try:
    import provino
    OUT["provino.html"] = provino.build
except ImportError:
    pass
try:
    import sipario
    OUT["sipario.html"] = sipario.build
except ImportError:
    pass
try:
    import moodboard
    OUT["moodboard.html"] = moodboard.build
except ImportError:
    pass

for name, fn in OUT.items():
    html = fn()
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
        f.write(html)
    print(name, len(html) // 1024, "KB")

if "moodboard.html" in OUT:
    html = moodboard.build(stills=True)
    with open(os.path.join(HERE, "moodboard-local.html"), "w", encoding="utf-8") as f:
        f.write(html)
    print("moodboard-local.html", len(html) // 1024, "KB")
