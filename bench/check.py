import json
import sys


def pick(doc, path):
    for k in path.split("."):
        doc = doc[int(k)] if isinstance(doc, list) else doc.get(k) if isinstance(doc, dict) else None
        if doc is None:
            return None
    return doc


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: check.py RESULT.json BUDGETS.json\n\nFails when a metric exceeds its budget by more than the margin. Every budget is a ceiling.\n")
        sys.exit(2)
    result = json.load(open(sys.argv[1]))
    budgets = json.load(open(sys.argv[2]))
    over, missing = [], []
    for path, b in sorted(budgets["metrics"].items()):
        v = pick(result, path)
        if v is None:
            missing.append(path)
            print("%-60s missing" % path)
            continue
        limit = b["budget"] * (1 + b.get("margin", budgets.get("margin", 0.1))) + b.get("slack", 0)
        word = "ok"
        if v > limit:
            word = "OVER"
            over.append(path)
        elif v < b["budget"] * 0.7 - b.get("slack", 0):
            word = "ok, tighten"
        goal = b.get("goal")
        if goal is not None and v > goal:
            word += " (goal %s)" % goal
        print("%-60s %10.1f  budget %10.1f  limit %10.1f  %s" % (path, v, b["budget"], limit, word))
    if over or missing:
        print("FAIL: %d over budget, %d missing: %s" % (len(over), len(missing), ", ".join(over + missing)))
        sys.exit(1)
    print("PASS: %d metrics within budget" % len(budgets["metrics"]))


if __name__ == "__main__":
    main()
