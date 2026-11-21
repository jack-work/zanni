"""Seeded, replayable campaigns against the figchat bundle.

  fuzz.py BUNDLE [--campaign composer|gestures|network|all] [--seed N|random]
          [--runs K | --minutes M] [--steps N] [--gateway PATH] [--regress-dir D]
          [--replay FILE] [--no-shrink]

A run's actions come from random.Random(seed) alone, so a seed replays the
same list. A failing run is shrunk to a minimal action list and written to
the regress directory as JSON, which regress/run.py replays.
"""
import argparse
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from playwright.sync_api import sync_playwright

from campaigns import ALL
from engine import execute, plan, save_regression, shrink

ARGS = ["--no-sandbox", "--disable-audio-output", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--campaign", default="all")
    ap.add_argument("--seed", default="1")
    ap.add_argument("--runs", type=int, default=0)
    ap.add_argument("--minutes", type=float, default=0)
    ap.add_argument("--steps", type=int, default=60)
    ap.add_argument("--gateway", default=os.environ.get("FIGFUZZ_GATEWAY"))
    ap.add_argument("--regress-dir", default="fuzz-found")
    ap.add_argument("--replay")
    ap.add_argument("--no-shrink", action="store_true")
    ap.add_argument("--shrink-seconds", type=int, default=240)
    ap.add_argument("--strict", default="")
    ap.add_argument("--keep-going", action="store_true")
    o = ap.parse_args()
    bundle = os.path.abspath(o.bundle)
    seed = random.SystemRandom().randrange(1, 2 ** 31) if o.seed == "random" else int(o.seed)
    names = list(ALL) if o.campaign == "all" else o.campaign.split(",")
    found = []
    strict = tuple(x for x in o.strict.split(",") if x)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        if o.replay:
            doc = json.load(open(o.replay))
            f = execute(browser, bundle, ALL[doc["campaign"]], doc["profile"], doc["actions"], o.gateway, strict=doc.get("strict", ()))
            print("replay %s: %s" % (o.replay, "passes" if f is None else "FAILS " + str(f)))
            browser.close()
            return 1 if f else 0
        deadline = time.time() + o.minutes * 60 if o.minutes else None
        share = (o.minutes * 60 / len(names)) if o.minutes else 0
        print("seed %d" % seed)
        for name in names:
            c = ALL[name]
            if c.needs_gateway and not o.gateway:
                print("%s: skipped, no --gateway or FIGFUZZ_GATEWAY" % name)
                continue
            start = time.time()
            n = 0
            while True:
                if o.minutes and time.time() - start > share:
                    break
                if not o.minutes and n >= max(o.runs, 1):
                    break
                s = seed + n
                n += 1
                doc = plan(c, s, o.steps)
                t0 = time.time()
                f = execute(browser, bundle, c, doc["profile"], doc["actions"], o.gateway, strict=strict)
                print("%s seed %d (%s, %d steps): %s %.1fs" % (name, s, doc["profile"], len(doc["actions"]), "ok" if f is None else "FAIL " + str(f), time.time() - t0), flush=True)
                if f is None:
                    continue
                actions = doc["actions"][:f.step + 1] if f.step is not None and f.step < len(doc["actions"]) else doc["actions"]
                if not o.no_shrink:
                    actions = shrink(browser, bundle, c, doc["profile"], actions, f.invariant, o.gateway, o.shrink_seconds, strict=strict)
                path = save_regression(o.regress_dir, c, s, doc["profile"], f.invariant, f.message, actions, strict=strict)
                print("  wrote %s" % path, flush=True)
                found.append(path)
                if not o.keep_going and not o.minutes:
                    break
        browser.close()
    print("%d failure(s)" % len(found))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
