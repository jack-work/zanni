"""A fixture backend for the grants page: the contract from the sandbox
lead's draft 2, served from memory, so the page can be built and tested
before the grants service exists. It checks what the page can get wrong (a
widened request, an unanswered item, a stale or foreign challenge) and
nothing the real service must prove: it does not verify the signature.

    python3 test/grants_fixture.py [port]     then open http://localhost:<port>/r/r-7f3a19
"""
import base64
import copy
import datetime
import hashlib
import json
import os
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "examples", "grants")
ASSETS = os.path.join(ROOT, "assets")
ENROLL = os.path.join(ROOT, "examples", "grants-enroll")

CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; "
       "connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png"}
LENGTHS = (900, 3600, 86400, 604800)
ENROLL_CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'none'; "
              "frame-ancestors 'none'; form-action 'none'; base-uri 'none'")
CHALLENGE_TTL = 60

BOX0 = {"id": "sandbox:box0@grants", "kind": "sandbox", "edge_name": "box0"}


def seed():
    return {
        "principals": {BOX0["id"]: dict(BOX0, requester_label="Gluck's own laptop")},
        "requests": {
            "r-7f3a19": {
                "id": "r-7f3a19", "principal": BOX0["id"], "state": "pending", "age_s": 40,
                "note": "landing the queue fix needs these three",
                "items": [
                    {"id": "i-1", "type": "keel", "resource": "keel:repo/juglar", "path": "refs/heads/box0/*",
                     "actions": ["push"], "summary": "Push branches to juglar",
                     "why": "to land the queue fix for review", "max_duration_s": 604800},
                    {"id": "i-2", "type": "figaro.form", "resource": "form:@62c5c9bf", "path": "skills.tts",
                     "actions": ["read"], "summary": "Read the tts skill on Il Zanni's board",
                     "why": "to voice the release notes", "max_duration_s": 604800},
                    {"id": "i-3", "type": "gmail", "resource": "gmail", "path": "to: any",
                     "actions": ["send", "draft"], "summary": "Send mail as you",
                     "why": "to tell Mike the build is up", "max_duration_s": 3600},
                ],
                "suggested": [
                    {"id": "s-1", "widens": "i-1", "type": "keel", "resource": "keel:repo/juglar",
                     "path": "refs/heads/box0/*", "actions": ["create", "delete"],
                     "summary": "Create and delete box0 branches on juglar", "why": "pushing new branches needs create",
                     "max_duration_s": 604800},
                    {"id": "s-2", "type": "figaro.form", "resource": "form:@62c5c9bf", "path": "skills.*",
                     "actions": ["read"], "summary": "Read all skills on Il Zanni's board",
                     "why": "the last 3 requests from box0 each asked for one skill",
                     "max_duration_s": 86400},
                ],
            },
            "r-80c2": {
                "id": "r-80c2", "principal": BOX0["id"], "state": "pending", "age_s": 240,
                "note": "<b>trust me</b>",
                "items": [
                    {"id": "i-1", "type": "aws", "resource": "aws:spain-dev", "path": "ReadOnly",
                     "actions": ["read"], "summary": "Read spain-dev",
                     "why": "<script>alert(1)</script> to list the buckets", "max_duration_s": 86400},
                ],
                "suggested": [],
            },
            "r-80c9": {
                "id": "r-80c9", "principal": BOX0["id"], "state": "pending", "age_s": 60,
                "note": "", "items": [
                    {"id": "i-1", "type": "keel", "resource": "keel:repo/zanni", "path": "refs/heads/box0/*",
                     "actions": ["push"], "summary": "Push to zanni", "why": "", "max_duration_s": 604800},
                ], "suggested": [],
            },
        },
        "grants": {
            "g-aws": {"id": "g-aws", "principal": BOX0["id"], "type": "aws", "resource": "aws:spain-dev",
                      "path": "ReadOnly", "actions": ["read"], "summary": "Read spain-dev",
                      "total_s": 3600, "until": time.time() + 1620},
            "g-zanni": {"id": "g-zanni", "principal": BOX0["id"], "type": "keel", "resource": "keel:repo/zanni",
                        "path": "refs/heads/box0/*", "actions": ["push"], "summary": "Push to zanni",
                        "total_s": 3600, "until": time.time() + 240},
        },
        "reviews": {},
        "sealed": [],
    }


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def stamp(t):
    return datetime.datetime.fromtimestamp(t).astimezone().isoformat(timespec="seconds")


def length(s):
    return {900: "15m", 3600: "1h", 86400: "1d", 604800: "1w"}.get(s, f"{s}s")


class Refused(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status


def lines_for_decision(payload):
    out = [f"request    {payload['request_id']}", f"principal  {payload['principal']}"]
    for it in payload["items"]:
        out.append(f"item {it['item_id']}  {it['verdict']}")
        out.append(f"  type       {it['type']}")
        out.append(f"  resource   {it['resource']}")
        out.append(f"  path       {it['path']}")
        out.append(f"  actions    {' '.join(it['actions'])}")
        out.append(f"  expires_at {it['expires_at'] or 'never: denied'}" +
                   (f"  ({length(it['duration_s'])})" if it["duration_s"] else ""))
    out.append(f"issued_at  {payload['issued_at']}")
    out.append(f"nonce      {payload['nonce']}")
    return out


def lines_for_revoke(payload):
    return [
        f"revoke     {payload['grant_id']}",
        f"principal  {payload['principal']}",
        f"  type       {payload['type']}",
        f"  resource   {payload['resource']}",
        f"  path       {payload['path']}",
        f"  actions    {' '.join(payload['actions'])}",
        f"  ends_at    {payload['ends_at']}",
        f"issued_at  {payload['issued_at']}",
        f"nonce      {payload['nonce']}",
    ]


class Store:
    def __init__(self, rp_id="localhost"):
        self.lock = threading.Lock()
        self.rp_id = rp_id
        self.origin = None
        self.reset()

    def reset(self):
        with self.lock:
            self.s = seed()

    def principal_view(self, pid):
        p = self.s["principals"].get(pid)
        if not p:
            raise Refused(404, "no such principal")
        now = time.time()
        live = []
        for g in self.s["grants"].values():
            if g["principal"] != pid or g["until"] <= now:
                continue
            live.append({k: g[k] for k in ("id", "type", "resource", "path", "actions", "summary", "total_s")} |
                        {"remaining_s": round(g["until"] - now)})
        live.sort(key=lambda g: g["remaining_s"], reverse=True)
        pending = [{"id": r["id"], "items": len(r["items"]), "age_s": r["age_s"]}
                   for r in self.s["requests"].values() if r["principal"] == pid and r["state"] == "pending"]
        pending.sort(key=lambda r: r["age_s"], reverse=True)
        return {"principal": {k: p[k] for k in ("id", "kind", "edge_name")}, "live": live,
                "pending": pending, "limit": {"open_max": 3}}

    def request_view(self, rid):
        r = self.s["requests"].get(rid)
        if not r:
            raise Refused(404, "no such request")
        p = self.s["principals"][r["principal"]]
        out = copy.deepcopy(r)
        out["principal"] = {k: p[k] for k in ("id", "kind", "edge_name")}
        return out

    def decide(self, rid, draft):
        r = self.s["requests"].get(rid)
        if not r:
            raise Refused(404, "no such request")
        if r["state"] != "pending":
            raise Refused(409, f"request {rid} is {r['state']}")
        now = time.time()

        def entry(src, d, ident):
            verdict = d.get("verdict")
            if verdict not in ("yes", "no"):
                raise Refused(400, f"{ident} has no answer")
            actions = d.get("actions") or src["actions"]
            if not actions or any(a not in src["actions"] for a in actions):
                raise Refused(400, f"{ident} asks for actions it was not requested with")
            dur = d.get("duration_s") if verdict == "yes" else None
            if verdict == "yes" and (dur not in LENGTHS or dur > src["max_duration_s"]):
                raise Refused(400, f"{ident} has a length the catalog does not allow")
            return {"item_id": ident, "type": src["type"], "resource": src["resource"], "path": src["path"],
                    "actions": [a for a in src["actions"] if a in actions], "verdict": verdict,
                    "duration_s": dur, "expires_at": stamp(now + dur) if dur else None}

        items = {i["id"]: i for i in r["items"]}
        got = {d.get("item_id"): d for d in draft.get("items", [])}
        if set(got) != set(items):
            raise Refused(400, "every requested item needs exactly one answer")
        out = [entry(items[k], got[k], k) for k in items]
        sugg = {s["id"]: s for s in r.get("suggested", [])}
        seen = set()
        for d in draft.get("extra", []):
            sid = d.get("suggestion_id")
            if sid not in sugg or sid in seen:
                raise Refused(400, "an extra item is not one spain suggested")
            seen.add(sid)
            out.append(entry(sugg[sid], d, sid))
        payload = {"request_id": rid, "principal": r["principal"], "items": out,
                   "nonce": b64url(secrets.token_bytes(12)), "issued_at": stamp(now)}
        return self.issue({"kind": "decision", "payload": payload}, lines_for_decision(payload))

    def revoke(self, gid):
        g = self.s["grants"].get(gid)
        if not g or g["until"] <= time.time():
            raise Refused(404, "no such live grant")
        now = time.time()
        payload = {"grant_id": gid, "principal": g["principal"], "type": g["type"], "resource": g["resource"],
                   "path": g["path"], "actions": g["actions"], "ends_at": stamp(now),
                   "nonce": b64url(secrets.token_bytes(12)), "issued_at": stamp(now)}
        return self.issue({"kind": "revoke", "payload": payload}, lines_for_revoke(payload))

    def issue(self, review, lines):
        if any(c < " " for line in lines for c in line):
            raise Refused(400, "a field holds a newline or control character")
        digest = hashlib.sha256("\n".join(lines).encode()).digest()
        review_id = "v-" + b64url(secrets.token_bytes(6))
        review.update(lines=lines, challenge=b64url(digest), issued=time.time(), used=False)
        self.s["reviews"][review_id] = review
        hexd = digest.hex()[:16]
        return {"review_id": review_id, "receipt_lines": lines,
                "digest": " ".join(hexd[i:i + 4] for i in range(0, 16, 4)),
                "expires_in_s": CHALLENGE_TTL,
                "publicKey": {"challenge": review["challenge"], "rpId": self.rp_id, "timeout": 60000,
                              "userVerification": "required", "allowCredentials": []}}

    def seal(self, review_id, assertion):
        v = self.s["reviews"].get(review_id)
        if not v:
            raise Refused(404, "no such review")
        if v["used"] or time.time() - v["issued"] > CHALLENGE_TTL:
            raise Refused(410, "this review is spent")
        try:
            client = json.loads(unb64url(assertion["response"]["clientDataJSON"]))
        except (KeyError, TypeError, ValueError):
            raise Refused(400, "no assertion")
        if client.get("type") != "webauthn.get" or client.get("challenge") != v["challenge"]:
            raise Refused(403, "the assertion is over a different challenge")
        if self.origin and client.get("origin") != self.origin:
            raise Refused(403, "the assertion came from another origin")
        if not assertion["response"].get("signature"):
            raise Refused(403, "the assertion carries no signature")
        v["used"] = True
        p = v["payload"]
        now = time.time()
        if v["kind"] == "decision":
            req = self.s["requests"][p["request_id"]]
            if req["state"] != "pending":
                raise Refused(409, f"request {req['id']} is {req['state']}")
            req["state"] = "decided"
            for it in p["items"]:
                if it["verdict"] != "yes":
                    continue
                gid = "g-" + b64url(secrets.token_bytes(4))
                src = next((i for i in req["items"] + req.get("suggested", []) if i["id"] == it["item_id"]), {})
                self.s["grants"][gid] = {"id": gid, "principal": p["principal"], "type": it["type"],
                                         "resource": it["resource"], "path": it["path"],
                                         "actions": it["actions"], "summary": src.get("summary", ""),
                                         "total_s": it["duration_s"], "until": now + it["duration_s"]}
        else:
            self.s["grants"].pop(p["grant_id"], None)
        self.s["sealed"].append({"review_id": review_id, "lines": v["lines"], "kind": v["kind"]})
        return {"sealed_at": stamp(now), "review_id": review_id}


def handler_for(store):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def send(self, status, body, ctype="application/json", extra=None):
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def file(self, path, csp=CSP):
            if not os.path.isfile(path):
                return self.send(404, {"error": "not found"})
            ext = os.path.splitext(path)[1]
            with open(path, "rb") as f:
                body = f.read()
            extra = {"Content-Security-Policy": csp, "Referrer-Policy": "no-referrer"} if ext == ".html" else None
            self.send(200, body, TYPES.get(ext, "application/octet-stream"), extra)

        def body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if not n:
                return {}
            if not (self.headers.get("Content-Type") or "").startswith("application/json"):
                raise Refused(415, "json only")
            return json.loads(self.rfile.read(n))

        def do_GET(self):
            path = unquote(self.path.split("?")[0])
            parts = [p for p in path.split("/") if p]
            try:
                with store.lock:
                    if parts[:2] == ["api", "requests"] and len(parts) == 3:
                        return self.send(200, store.request_view(parts[2]))
                    if parts[:2] == ["api", "principals"] and len(parts) == 3:
                        return self.send(200, store.principal_view(parts[2]))
            except Refused as e:
                return self.send(e.status, {"error": str(e)})
            if parts[:1] in (["r"], ["p"]) or not parts:
                return self.file(os.path.join(PAGE, "index.html"))
            if parts[0] == "assets" and ".." not in parts:
                return self.file(os.path.join(ASSETS, *parts[1:]))
            if parts == ["enroll.html"]:
                return self.file(os.path.join(ENROLL, "index.html"), ENROLL_CSP)
            if len(parts) == 1 and parts[0] in ("enroll.js", "enroll.css"):
                return self.file(os.path.join(ENROLL, parts[0]))
            if len(parts) == 1 and parts[0] in ("grants.js", "grants.css"):
                return self.file(os.path.join(PAGE, parts[0]))
            self.send(404, {"error": "not found"})

        def do_POST(self):
            parts = [p for p in unquote(self.path.split("?")[0]).split("/") if p]
            try:
                if self.headers.get("Origin") not in (None, store.origin):
                    raise Refused(403, "cross-origin")
                data = self.body()
                with store.lock:
                    if parts[:2] == ["api", "requests"] and len(parts) == 4 and parts[3] == "review":
                        return self.send(200, store.decide(parts[2], data))
                    if parts[:2] == ["api", "grants"] and len(parts) == 4 and parts[3] == "revoke":
                        return self.send(200, store.revoke(parts[2]))
                    if parts[:2] == ["api", "reviews"] and len(parts) == 4 and parts[3] == "seal":
                        return self.send(200, store.seal(parts[2], data))
                    if parts == ["api", "_fixture", "reset"]:
                        store.s = seed()
                        return self.send(200, {"ok": True})
                    if parts == ["api", "_fixture", "sealed"]:
                        return self.send(200, store.s["sealed"])
                    if parts == ["api", "_fixture", "age"]:
                        for v in store.s["reviews"].values():
                            v["issued"] -= CHALLENGE_TTL + 1
                        return self.send(200, {"ok": True})
            except Refused as e:
                return self.send(e.status, {"error": str(e)})
            except ValueError:
                return self.send(400, {"error": "bad json"})
            self.send(404, {"error": "not found"})

    return H


def serve(port=0):
    store = Store()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler_for(store))
    store.origin = f"http://localhost:{httpd.server_address[1]}"
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, store


if __name__ == "__main__":
    httpd, store = serve(int(sys.argv[1]) if len(sys.argv) > 1 else 8765)
    print(f"{store.origin}/r/r-7f3a19")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        httpd.shutdown()
