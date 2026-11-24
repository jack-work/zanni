import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import timing  # noqa: E402
from campaigns.audio import Audio, facts, playback_failure
from engine import Failure

SLACK_MS = 20
PACE = {"seed": 7, "jitterMs": 40, "stallProbability": 0.002, "stallMs": [300, 1500], "slowStartMs": 500}


def report_gap(worst):
    if worst:
        timing.record("fuzz.paced_gap_ms", round(worst[0], 1), worst[1])


def schedule_failures(f, st, stalls, jitters=()):
    chunks = {int(k): v for k, v in f["chunks"].items()}
    live = [p for p in f["played"] if p["id"] in chunks and not (p["stopAt"] is not None and p["stopAt"] <= p["at"])]
    live.sort(key=lambda p: p["at"])
    prev = None
    worst = None
    for p in live:
        c = chunks[p["id"]]
        if prev:
            pp, pc = prev
            same = pc["turn"] == c["turn"] and pc["sid"] == c["sid"] and pc["startChars"] == c["startChars"]
            cut = any(pp["t"] < t <= p["t"] for t in st.stops) or pp["stopAt"] is not None
            if same and not cut:
                gap_ms = (p["at"] - (pp["at"] + pp["dur"])) * 1000
                allowed = sum(s["ms"] for s in stalls if pc["e"] - 250 <= s["s"] <= c["e"]) + SLACK_MS
                if worst is None or gap_ms - allowed > worst[0] - worst[1]:
                    worst = (gap_ms, allowed)
                if c["offset"] != pc["offset"] + pc["bytes"]:
                    skipped = [k for k in chunks.values() if k["turn"] == c["turn"] and k["sid"] == c["sid"] and k["startChars"] == c["startChars"] and pc["offset"] < k["offset"] < c["offset"] and k["id"] not in {q["id"] for q in f["played"]}]
                    if skipped:
                        report_gap(worst)
                        return Failure("paced-skip", "turn %s plays offset %s straight after %s, skipping %d chunks that reached the page" % (c["turn"], c["offset"], pc["offset"], len(skipped)))
        prev = (p, c)
    report_gap(worst)
    return None


class Paced(Audio):
    name = "paced"
    leak_wait = 90

    def start(self, run):
        super().start(run)
        run.stack.speech_call("/set", {"pace": PACE})

    def gen(self, rng, i):
        a = super().gen(rng, i)
        if a["k"] == "fault" and a["op"].get("op") == "speech.stall":
            return {"k": "wait", "ms": 800}
        if a["k"] == "speech":
            return {"k": "pace", "jitter": rng.choice([0, 20, 80]), "p": rng.choice([0, 0.002, 0.005]), "slow": rng.choice([200, 500, 800]), "per": rng.choice([480, 9600, 48000])}
        return a

    def apply(self, run, a):
        if a["k"] == "pace":
            pace = dict(PACE, jitterMs=a["jitter"], stallProbability=a["p"], slowStartMs=a["slow"], seed=a["slow"] + a["jitter"])
            run.stack.speech_call("/set", {"pace": pace, "pcmPerText": a["per"]})
        else:
            super().apply(run, a)

    def extra_always(self, run):
        super().extra_always(run)
        self.check_schedule(run)

    def check_schedule(self, run):
        state = run.stack.speech_call()
        stalls = state["stalls"] + state["starves"] + state["lates"]
        for st in run.state["ps"]:
            if st.page.is_closed():
                continue
            f = facts(st.page)
            bad = f and schedule_failures(f, st, stalls, state["jitters"])
            if bad:
                raise bad

    def before_quiescent(self, run):
        super().before_quiescent(run)
        run.stack.speech_call("/set", {"pcmPerText": 480})
