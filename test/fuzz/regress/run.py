"""Replay every regression in this directory against a bundle.

  run.py BUNDLE [--gateway PATH] [FILE...]

status "pass" must pass. status "xfail" records a real bug whose fix belongs to
`owner`: it must still fail with the same invariant (three tries, timing
varies), and when it starts passing the run fails so the marker gets removed.
"""
import argparse
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from playwright.sync_api import sync_playwright

from campaigns import ALL
from engine import execute

ARGS = ["--no-sandbox", "--disable-audio-output"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--gateway", default=os.environ.get("FIGFUZZ_GATEWAY"))
    ap.add_argument("files", nargs="*")
    o = ap.parse_args()
    files = o.files or sorted(glob.glob(os.path.join(HERE, "*.json")))
    bad = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        for path in files:
            doc = json.load(open(path))
            c = ALL[doc["campaign"]]
            name = os.path.basename(path)
            if c.needs_gateway and not o.gateway:
                print("SKIP %s (no gateway)" % name)
                continue
            tries = 3 if doc["status"] == "xfail" else 1
            hit = None
            for _ in range(tries):
                f = execute(browser, os.path.abspath(o.bundle), c, doc["profile"], doc["actions"], o.gateway, strict=doc.get("strict", ()))
                if f is not None and f.invariant == doc["invariant"]:
                    hit = f
                    break
                if f is not None and doc["status"] != "xfail":
                    hit = f
                    break
            if doc["status"] == "xfail":
                if hit:
                    print("xfail %s (%s): %s" % (name, doc.get("owner"), hit.invariant))
                else:
                    print("FIXED %s: it passes now, remove status xfail" % name)
                    bad += 1
            elif hit:
                print("FAIL %s: %s" % (name, hit))
                bad += 1
            else:
                print("ok   %s" % name)
        browser.close()
    print("%d regression(s) off" % bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
