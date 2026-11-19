import os
import sys

from playwright.sync_api import sync_playwright

page_url = "file://" + os.path.abspath(sys.argv[1])

RIGHT_EDGES = "[...document.querySelectorAll('.z2-usage-access [data-col=req], .z2-usage-quiet [data-col=req]')].map(e => Math.round(e.getBoundingClientRect().right))"
BOXES = "[...document.querySelectorAll('.z2-usage-plan, .z2-usage-access, .z2-usage-quiet, .z2-usage-prov-h')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(',') }).join(';')"
COLOR = "e => getComputedStyle(e).color"

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 900}, color_scheme="light")

    page.goto(page_url + "?hold")
    band = page.locator(".z2-usage")
    assert band.get_attribute("data-state") == "loading" and band.get_attribute("aria-busy") == "true"
    assert page.locator(".z2-usage-skel").is_visible()
    assert page.locator(".z2-usage-plan").count() == 0
    page.evaluate("usage.fail(new Error('HTTP 503'))")
    assert band.get_attribute("data-state") == "error"
    assert page.locator(".z2-usage-note[role=alert]").text_content() == "Could not load plans: HTTP 503."
    assert not page.locator(".z2-usage-skel").is_visible(), "an error is not a loading state"

    page.evaluate("usage.update(USAGE_SPAIN)")
    assert band.get_attribute("data-state") == "ready" and band.get_attribute("aria-busy") is None
    assert not page.locator(".z2-usage-note").is_visible()
    assert page.locator(".z2-usage-prov h3").all_text_contents() == ["Anthropic", "OpenAI", "Google"]
    assert page.locator(".z2-usage-quiet b").all_text_contents() == ["Experiential Labs", "Modelflare", "Azure"]
    assert page.locator(".z2-usage-quiet .z2-usage-meter").count() == 0, "a quiet provider carries no meter"

    kic = page.locator(".z2-usage-plan[data-key='p:anthropic-kic']")
    assert kic.locator(".z2-usage-name b").text_content() == "Claude Team 5x", "a plan_label token names the plan, not the provider's default product"
    assert "anthropic-kic" not in kic.text_content(), "the upstream id lives in the drawer, not the row"
    assert kic.locator("> .z2-usage-win").text_content() == "5 h", "the headline is the binding window, not the first or the weekly"
    assert kic.locator(".z2-usage-pct").text_content() == "17%"
    assert kic.get_attribute("data-tone") == "allowed"
    assert kic.locator("> .z2-usage-notes > .z2-usage-reset").text_content() == "resets 11:00 \u00b7 in 4 h"
    assert kic.locator(".z2-usage-other").all_text_contents() == ["7 d3%resets Thu 26 01:00 \u00b7 in 7 d", "7 d \u201coi\u201d0%27 min oldresets Thu 26 01:00 \u00b7 in 7 d"], "every metered window carries its own reset"
    assert kic.locator(".z2-usage-flag").all_text_contents() == ["overage rejected"]
    assert kic.locator(".z2-usage-other[data-key=overage]").count() == 0, "a window with no percent draws no meter"

    kic2 = page.locator(".z2-usage-plan[data-key='p:anthropic-kic-2']")
    assert kic.locator(".z2-usage-chip").text_content() == "kic \u00b7 seat 1" and kic2.locator(".z2-usage-chip").text_content() == "kic \u00b7 seat 2"
    assert kic2.locator(".z2-usage-chip").get_attribute("data-tip-text") == "kic \u00b7 seat 2 of 2 \u00b7 upstream anthropic-kic-2"
    assert kic.locator("> .z2-usage-notes > .z2-usage-reset").text_content() != kic2.locator("> .z2-usage-notes > .z2-usage-reset").text_content(), "two seats differ by their reset"
    chips = page.locator(".z2-usage-plan[data-key='p:anthropic-max'] .z2-usage-chip, .z2-usage-plan[data-key='p:anthropic-personal'] .z2-usage-chip").all_text_contents()
    assert chips == ["personal", "personal"], "negative control: one account under two products is not two seats"
    page.evaluate("(() => { const d = structuredClone(USAGE_SPAIN); d.providers[0].plans.splice(1, 1); usage.update(d) })()")
    assert kic.locator(".z2-usage-chip").text_content() == "kic", "negative control: a lone seat carries no number"
    page.evaluate("usage.update(USAGE_SPAIN)")

    primary = "[...document.querySelectorAll('.z2-usage-plan')].filter(e => e.querySelector('.z2-usage-primary').offsetParent).map(e => e.dataset.key)"
    assert page.evaluate(primary) == [], "negative control: before a last-hour answer arrives nothing is marked"
    before_primary = page.evaluate(BOXES)
    page.evaluate("usage.update(USAGE_SPAIN, USAGE_RECENT)")
    assert page.evaluate(primary) == ["p:anthropic-kic-2"], "a primary only where two or more plans of a provider ran in the hour"
    assert page.locator(".z2-usage-plan[data-key='p:gemini'] .z2-usage-primary").is_hidden(), "Gemini ran on one plan: no marker"
    assert page.evaluate(BOXES) == before_primary, "the marker arrives without moving a row"
    assert kic2.get_attribute("data-primary") == "true" and kic.get_attribute("data-primary") is None
    assert kic2.locator(".z2-usage-primary").get_attribute("data-tip-text") == "Carried 41 of 72 Anthropic requests in the last 60 min, more than any other plan."
    assert page.locator(".z2-usage-prov[data-key=openai_subscription] .z2-usage-primary").is_hidden(), "nothing ran in the hour: no marker"
    page.evaluate("usage.update(USAGE_SPAIN)")
    assert page.evaluate(primary) == ["p:anthropic-kic-2"], "a refresh that brings no recent answer keeps the last one"
    page.evaluate("(() => { const r = structuredClone(USAGE_RECENT); r.providers[0].plans[2].access[1].requests = 400; usage.update(USAGE_SPAIN, r) })()")
    assert page.evaluate(primary) == ["p:anthropic-max"], "the marker follows the traffic"
    page.evaluate("(() => { const r = structuredClone(USAGE_RECENT); r.providers.forEach(pv => pv.plans.forEach(pl => pl.access.forEach(a => { a.requests = 0 }))); usage.update(USAGE_SPAIN, r) })()")
    assert page.evaluate(primary) == [], "negative control: an idle hour marks nothing"
    page.evaluate("usage.update(USAGE_SPAIN, USAGE_RECENT)")
    page.evaluate("usage.update(USAGE_SPAIN, null)")
    assert page.evaluate(primary) == [], "negative control: no recent answer, no claim"
    page.evaluate("usage.update(USAGE_SPAIN, USAGE_RECENT)")

    meters = "[...document.querySelectorAll('.z2-usage-plan[data-metered=true] .z2-usage-meter')].map(e => { const r = e.getBoundingClientRect(); return Math.round(r.x) + ':' + Math.round(r.width) })"
    pcts = "[...document.querySelectorAll('.z2-usage-plan > .z2-usage-pct, .z2-usage-other > .z2-usage-val')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().right))"
    assert len(page.evaluate(meters)) == 9 and len(set(page.evaluate(meters))) == 1, page.evaluate(meters)
    assert len(set(page.evaluate(pcts))) == 1, "every percent ends on one edge"
    kic.evaluate("e => e.style.setProperty('--z2u-win', '9rem')")
    assert len(set(page.evaluate(meters))) == 2 and len(set(page.evaluate(pcts))) == 2, "negative control: one row on its own track widths breaks both witnesses"
    kic.evaluate("e => e.style.removeProperty('--z2u-win')")

    mx = page.locator(".z2-usage-plan[data-key='p:anthropic-max']")
    assert mx.get_attribute("data-tone") == "hot", "at or past 90% the meter runs hot"
    assert mx.locator(".z2-usage-name b").text_content() == "Claude Max 20x"
    assert mx.locator(".z2-usage-state").text_content() == "warning"
    assert mx.locator(".z2-usage-pct").evaluate(COLOR) == "rgb(125, 46, 46)", "light hot is keel's oxblood"
    assert mx.locator("> .z2-usage-meter .z2-usage-meter-fill").evaluate("e => getComputedStyle(e).fill") == "rgb(125, 46, 46)"
    assert kic.locator(".z2-usage-pct").evaluate(COLOR) != "rgb(125, 46, 46)", "negative control: an allowed plan at 17% is not hot"
    page.evaluate("(() => { const d = structuredClone(USAGE_SPAIN); d.providers[0].plans[2].windows[0].used_percent = 80; usage.update(d) })()")
    assert mx.get_attribute("data-tone") == "allowed_warning", "negative control: a warning under 90% stays amber"
    assert mx.locator(".z2-usage-pct").evaluate(COLOR) == "rgb(135, 88, 15)"
    page.evaluate("(() => { const d = structuredClone(USAGE_SPAIN); d.providers[0].plans[2].windows[0].used_percent = 89; d.providers[0].plans[2].windows[0].status = 'allowed'; usage.update(d) })()")
    assert mx.get_attribute("data-tone") == "allowed" and mx.locator(".z2-usage-state").text_content() == ""
    page.evaluate("usage.update(USAGE_SPAIN)")
    meter = mx.locator("> .z2-usage-meter")
    assert meter.get_attribute("role") == "meter" and meter.get_attribute("aria-valuenow") == "95" and meter.get_attribute("aria-valuemax") == "100"
    assert meter.get_attribute("aria-label") == "Claude Max 20x personal 7 d used", meter.get_attribute("aria-label")
    assert kic.locator(".z2-usage-other[data-key=seven_day] .z2-usage-meter").get_attribute("aria-label") == "Claude Team 5x kic seat 1 7 d used"
    direct_req = page.locator(".z2-usage-access[data-key='a:anthropic-max:direct:gluck:anthropic'] [data-col=req]")
    assert direct_req.evaluate("e => getComputedStyle(e).textDecorationLine") == "none", "values carry no dotted underline"
    assert page.locator(".z2-usage-access[data-key='a:anthropic-max:direct:gluck:anthropic'] [data-col=cache] .z2-usage-unit").evaluate("e => getComputedStyle(e).textDecorationLine") == "underline", "explained terms keep it"
    sec = kic.locator(".z2-usage-other[data-key=seven_day] .z2-usage-meter")
    assert sec.bounding_box()["height"] == kic.locator("> .z2-usage-meter").bounding_box()["height"], "secondary meters are as tall as the headline"

    via = page.locator(".z2-usage-access[data-key='a:anthropic-max:rou2:spain:anthropic-max']")
    direct = page.locator(".z2-usage-access[data-key='a:anthropic-max:direct:gluck:anthropic']")
    assert via.locator(".z2-usage-gw").text_content() == "rou2" and direct.locator(".z2-usage-gw").text_content() == "direct"
    assert via.locator(".z2-usage-gw").bounding_box()["x"] < via.locator(".z2-usage-where").bounding_box()["x"], "the gateway leads the line"
    assert direct.locator("[data-col=req]").text_content() == "12,515req"
    assert direct.locator("[data-col=cache]").text_content() == "cache95%"
    assert via.locator(".z2-usage-seen").text_content() == "this path last saw 7 d 94% (28 min old)"
    assert direct.locator(".z2-usage-seen").is_hidden(), "negative control: a path that agrees with the plan says nothing"
    edges = page.evaluate(RIGHT_EDGES)
    assert len(edges) == 11 and len(set(edges)) == 1, edges
    assert direct.locator("[data-col=req] .z2-usage-val").evaluate("e => getComputedStyle(e).fontVariantNumeric").find("tabular-nums") >= 0

    gpt = page.locator(".z2-usage-plan[data-key='p:chatgpt-personal']")
    assert gpt.get_attribute("data-tone") == "stale" and gpt.get_attribute("data-age") == "3"
    assert gpt.locator("> .z2-usage-notes > .z2-usage-state").text_content() == "3 d old, was limit reached"
    assert gpt.locator(".z2-usage-pct").evaluate(COLOR) == "rgb(90, 61, 50)", "a stale 100% is muted, never the fail tone"
    assert gpt.locator("> .z2-usage-meter").evaluate("e => getComputedStyle(e).opacity") == "0.45"
    page.evaluate("(() => { const d = structuredClone(USAGE_SPAIN); const w = d.providers[1].plans[0].windows[1]; w.stale = false; w.fetched_at = d.generated_at; usage.update(d) })()")
    assert gpt.get_attribute("data-tone") == "rejected" and gpt.get_attribute("data-age") is None, "negative control: the same window, fresh, takes its status tone"
    assert gpt.locator("> .z2-usage-meter").evaluate("e => getComputedStyle(e).opacity") == "1"
    assert gpt.locator("> .z2-usage-notes > .z2-usage-state").text_content() == "limit reached"
    page.evaluate("usage.update(USAGE_SPAIN)")

    unid = page.locator(".z2-usage-plan[data-key='p:unidentified']")
    assert unid.get_attribute("data-metered") == "false" and unid.locator(".z2-usage-meter").first.is_hidden()
    assert unid.locator(".z2-usage-state").text_content() == "no recent limit data \u00b7 last seen 9 h ago"

    kic.evaluate("e => { e.dataset.witness = 'same-node' }")
    before = page.evaluate(BOXES)
    page.evaluate("""(() => { const d = structuredClone(USAGE_SPAIN); const pl = d.providers[0].plans[0];
      pl.windows[0].used_percent = 18; pl.access[0].requests = 151; pl.access[0].last_seen = d.generated_at; d.generated_at = '2026-11-19T06:34:19Z'; usage.update(d) })()""")
    assert kic.locator(".z2-usage-pct").text_content() == "18%"
    assert kic.get_attribute("data-witness") == "same-node", "a refresh updates the row in place"
    assert page.evaluate(BOXES) == before, "no layout shift on refresh"
    page.evaluate("(() => { const d = structuredClone(USAGE_SPAIN); d.providers[0].plans.shift(); usage.update(d) })()")
    assert page.evaluate(BOXES) != before, "negative control: the box witness sees a row leave"
    page.evaluate("usage.update(USAGE_SPAIN)")

    kic = page.locator(".z2-usage-plan[data-key='p:anthropic-kic']")
    kic.focus()
    assert kic.evaluate("e => getComputedStyle(e).outlineStyle") == "solid"
    page.keyboard.press("x")
    assert page.evaluate("USAGE_OPENED.length") == 0, "negative control: only Enter and Space open"
    page.keyboard.press("Enter")
    assert page.evaluate("USAGE_OPENED[0]") == {"kind": "plan", "provider": "anthropic", "plan": "anthropic-kic"}
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    assert page.evaluate("USAGE_OPENED[1]") == {"kind": "access", "provider": "anthropic", "plan": "anthropic-kic", "gateway": "rou2", "host": "spain", "via": "anthropic-kic"}
    page.locator(".z2-usage-prov").first.focus()
    page.keyboard.press("Enter")
    assert page.evaluate("USAGE_OPENED[2]") == {"kind": "provider", "provider": "anthropic"}
    drill = page.evaluate("(() => { const d = usage.detail(USAGE_OPENED[0]); document.body.append(d.node); return [d.title, d.node.querySelectorAll('table').length, d.node.querySelector('td:nth-child(2)').textContent] })()")
    assert drill == ["Anthropic \u00b7 Claude Team 5x kic seat 1", 3, "five_hour"], drill

    page.evaluate("usage.fail(new Error('HTTP 502'))")
    assert band.get_attribute("data-state") == "error"
    assert page.locator(".z2-usage-note").text_content() == "Could not load plans: HTTP 502. Showing the answer from 06:34:14, 6 s old."
    assert page.locator(".z2-usage-plan").count() == 7, "the last answer stays on screen"
    assert page.locator(".z2-usage-body").evaluate("e => getComputedStyle(e).opacity") == "0.55"
    page.evaluate("usage.update(USAGE_SPAIN)")
    assert page.locator(".z2-usage-body").evaluate("e => getComputedStyle(e).opacity") == "1", "negative control: a good answer clears the error"

    page.evaluate("usage.update({ generated_at: USAGE_SPAIN.generated_at, providers: [] })")
    assert band.get_attribute("data-state") == "empty"
    assert page.locator(".z2-usage-note").text_content() == "No plan or usage data in this range."
    assert page.locator(".z2-usage-body > *").count() == 0
    page.evaluate("usage.update(USAGE_SPAIN)")

    assert page.locator("body").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(246, 237, 226)", "light ground is keel's sheet"
    assert page.locator(".z2-usage-pct").first.evaluate("e => getComputedStyle(e).fontFamily").lstrip('"').startswith('Inter'), "numbers are in the one UI face"
    page.emulate_media(color_scheme="dark")
    assert page.locator("body").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(26, 13, 15)"
    assert mx.locator(".z2-usage-pct").evaluate(COLOR) == "rgb(232, 130, 106)", "dark hot is keel's fail-red ramp"

    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert kic.locator(".z2-usage-name").bounding_box()["y"] < kic.locator("> .z2-usage-meter").bounding_box()["y"], "narrow: the name sits above its meter"
    m, st = mx.locator("> .z2-usage-meter").bounding_box(), mx.locator("> .z2-usage-notes > .z2-usage-state").bounding_box()
    assert abs((m["y"] + m["height"] / 2) - (st["y"] + st["height"] / 2)) < 12, "narrow: the warning sits on the meter line"
    page.set_viewport_size({"width": 360, "height": 740})
    head = page.locator(".z2-usage-prov-h").first
    assert head.locator(".z2-usage-total").bounding_box()["y"] > head.locator("h3").bounding_box()["y"] + 8, "narrow: provider totals sit under the name"
    page.set_viewport_size({"width": 1280, "height": 900})
    assert abs(head.locator(".z2-usage-total").bounding_box()["y"] - head.locator("h3").bounding_box()["y"]) < 12, "negative control: wide keeps them on one line"
    page.set_viewport_size({"width": 390, "height": 844})
    mx_paths = page.locator(".z2-usage-access[data-key^='a:anthropic-max:']")
    assert mx_paths.first.is_hidden() and mx.locator(".z2-usage-reset").is_hidden() and mx.locator(".z2-usage-flags").is_hidden(), "narrow: access lines and detail start collapsed"
    box, caret, bar = gpt.bounding_box(), gpt.locator(".z2-usage-more").bounding_box(), gpt.locator("> .z2-usage-meter").bounding_box()
    assert caret["x"] + caret["width"] <= box["x"] + box["width"] and bar["width"] > 80, "narrow: a long stale note takes its own line and leaves the meter and caret in place"
    assert kic2.locator(".z2-usage-primary").is_visible(), "narrow: the primary marker shows on a collapsed plan"
    opened = page.evaluate("USAGE_OPENED.length")
    mx.click(position={"x": 20, "y": 10})
    assert mx.get_attribute("data-open") == "true" and mx.get_attribute("aria-expanded") == "true"
    assert mx_paths.first.is_visible() and mx.locator(".z2-usage-reset").is_visible() and mx.locator(".z2-usage-flags").is_visible(), "narrow: a tap on the plan expands it"
    assert page.evaluate("USAGE_OPENED.length") == opened, "narrow: expanding is not opening the drawer"
    mx.locator(".z2-usage-drill-link").click()
    assert page.evaluate("USAGE_OPENED.length") == opened + 1, "narrow: details opens the drawer"
    via_req = page.locator(".z2-usage-access[data-key='a:anthropic-max:rou2:spain:anthropic-max'] [data-col=req]")
    assert via_req.get_attribute("data-tip-title") == "Requests" and via_req.get_attribute("title") is None, "tips, not title attributes, so they work on touch"
    mx.click(position={"x": 20, "y": 10})
    assert mx_paths.first.is_hidden(), "negative control: a second tap collapses it"
    page.set_viewport_size({"width": 1280, "height": 900})
    page.locator("link[href$='z2-usage.css']").evaluate("e => e.remove()")
    assert len(set(page.evaluate(RIGHT_EDGES))) > 1, "negative control: the aligned number columns belong to z2-usage.css"
    browser.close()

print("usage: ok")
