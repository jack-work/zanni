"""The one-time enrollment page: under connect-src 'none' it makes a passkey
for the page's own host, prints the credential id and the public key as the
authenticator holds them, and makes no request after it loads."""
import base64
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grants_fixture  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "examples/grants-enroll/enroll.js")) as f:
    src = f.read()
for bad in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket"):
    assert bad not in src, f"enroll.js must not {bad}"

httpd, store = grants_fixture.serve()


def unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    errors, csp, requests = [], [], []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: csp.append(m.text) if "Content Security Policy" in m.text else None)
    cdp = ctx.new_cdp_session(pg)
    cdp.send("WebAuthn.enable")
    auth = cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
        "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
        "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})["authenticatorId"]

    resp = pg.goto(store.origin + "/enroll.html")
    assert "connect-src 'none'" in resp.headers["content-security-policy"]
    pg.wait_for_load_state("networkidle")
    assert pg.inner_text("#rp") == "localhost", "the passkey is for the page's own host"
    pg.on("request", lambda r: requests.append(r.url))

    pg.click("#make")
    pg.wait_for_selector("#out:not([hidden])")
    held = cdp.send("WebAuthn.getCredentials", {"authenticatorId": auth})["credentials"]
    assert len(held) == 1 and held[0]["rpId"] == "localhost" and held[0]["isResidentCredential"]
    cred_id = pg.inner_text("#cred-id")
    assert unb64(cred_id) == base64.b64decode(held[0]["credentialId"]), "the printed id is the authenticator's"
    assert pg.inner_text("#alg") == "-7"
    cose = unb64(pg.inner_text("#cose"))
    assert cose[0] == 0xA5 and b"\x01\x02" in cose[:3] and b"\x03\x26" in cose[:6], f"an ES256 COSE key, got {cose[:8].hex()}"
    spki = unb64(pg.inner_text("#spki"))
    assert spki[0] == 0x30 and spki[-64:] == cose[-64:-32] + cose[-32:] or cose.endswith(spki[-32:]), "COSE and SPKI hold the same point"
    assert pg.locator("#make").is_hidden()
    assert not requests, f"the page sends nothing anywhere, sent {requests}"
    assert not errors, errors
    assert not csp, csp
    b.close()

httpd.shutdown()
print("grants enroll: ok")
