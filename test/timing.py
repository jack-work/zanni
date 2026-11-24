import json
import os


def load():
    try:
        avg = os.getloadavg()
    except OSError:
        avg = (None, None, None)
    return {"avg1": avg[0], "avg5": avg[1], "cpus": os.cpu_count()}


def record(name, value, limit, unit="ms"):
    over = value is not None and limit is not None and value > limit
    rec = {
        "name": name,
        "value": value,
        "limit": limit,
        "unit": unit,
        "over": over,
        "rev": os.environ.get("ZANNI_REV", "unknown"),
        "load": load(),
    }
    print("timing %s %s %s limit %s%s (report only)" % (name, value, unit, limit, " OVER" if over else ""))
    path = os.environ.get("ZANNI_TIMINGS")
    if path:
        with open(path, "a") as fh:
            fh.write(json.dumps(rec) + "\n")
    return rec


def collect(jsonl, out):
    rows = []
    if os.path.exists(jsonl):
        with open(jsonl) as fh:
            rows = [json.loads(line) for line in fh if line.strip()]
    with open(out, "w") as fh:
        json.dump(rows, fh, indent=1)
        fh.write("\n")


if __name__ == "__main__":
    import sys

    collect(sys.argv[1], sys.argv[2])
