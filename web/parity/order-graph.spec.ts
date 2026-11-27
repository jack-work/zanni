import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import { fakeRpc, test, expect, type MockCore } from "./fixtures";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore & { setRole(id: string, form: object): void; addRole(role: object): void; setTopology(root: object): void } };
const fixture = JSON.parse(readFileSync(new URL("../test/fixtures/order-queues.json", import.meta.url), "utf8")) as { roles: Role[]; topology: Record<string, string> };

interface Role {
  id: string;
  name: string;
  target: string;
  form: { queue?: Record<string, Record<string, unknown>> } & Record<string, unknown>;
}

const origin = `http://127.0.0.1:${Number(process.env.ORDER_PORT ?? 4175)}`;
const NOW = "2026-11-25T20:30:00Z";
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:" + new URL(origin).port + "; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const widget = fixture.roles.find((r) => r.name === "Widget Work")!;
const CROWN = "@c0de0001c0de0001c0de0001c0de0001";
const aria = (hex: string): string => ("c0ffee" + hex).repeat(4);
const node = (page: Page, id: string) => page.locator(`[data-node="${id}"]`);
const named = (page: Page, label: string, kind: string) => page.locator(`[data-node][data-kind=${kind}]`, { has: page.locator(".og-label", { hasText: new RegExp(`^${label}$`) }) });
const labels = (page: Page, kind: string) => page.locator(`[data-node][data-kind=${kind}] .og-label`);
const detail = (page: Page) => page.locator('[data-field="detail"]');
const entryId = (title: string): string => Object.values(widget.form.queue!).find((e) => e.title === title)!.id as string;
const row = (page: Page, title: string) => page.locator(`.ord-row[data-entry="${entryId(title)}"]`);

async function visit(page: Page, hash = "", count = hash.includes("view=command") ? 5 : 20): Promise<{ core: ReturnType<typeof mock.create>; errors: string[] }> {
  const core = mock.create({ step: 120, pageBytes: 24000, roles: fixture.roles, topology: fixture.topology });
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    (window as any).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as any).__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route(origin + "/", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": CSP } });
  });
  await fakeRpc(page, core);
  await page.goto(`${origin}/${hash}`);
  await page.locator(".ord-status[data-link='live']").waitFor();
  await page.locator("[data-node]").first().waitFor();
  await expect(page.locator("[data-node]")).toHaveCount(count);
  return { core, errors };
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let still = 0;
        const tick = () => {
          still = document.getAnimations().some((a) => a.playState === "running") ? 0 : still + 1;
          if (still > 8) done();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

async function edgesThroughNodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const g of document.querySelectorAll<SVGGElement>("[data-node]")) {
      const r = g.querySelector("rect")!;
      boxes.set(g.getAttribute("data-node")!, { x: +r.getAttribute("x")!, y: +r.getAttribute("y")!, w: +r.getAttribute("width")!, h: +r.getAttribute("height")! });
    }
    const bad: string[] = [];
    for (const p of document.querySelectorAll<SVGPathElement>("path[data-edge]")) {
      const a = p.getAttribute("data-from")!;
      const b = p.getAttribute("data-to")!;
      const len = p.getTotalLength();
      for (let i = 0; i <= 120; i++) {
        const pt = p.getPointAtLength((len * i) / 120);
        for (const [id, r] of boxes) {
          if (id === a || id === b) continue;
          if (r.x + 2 < pt.x && pt.x < r.x + r.w - 2 && r.y + 2 < pt.y && pt.y < r.y + r.h - 2) bad.push(a + " > " + b + " through " + id);
        }
      }
    }
    return [...new Set(bad)];
  });
}

test.describe("the order page against the fake door", () => {
  test("draws the graph of one central command and fits the screen", async ({ page }, info) => {
    const { errors } = await visit(page);
    await settle(page);
    await expect(labels(page, "role")).toHaveText(["@Crown", "@Frontier Knight", "@Frontier Strategist", "@Widget Engineer", "@Edge Engineer", "@Bridge Knight", "@Backend Lead", "@Lost Lead"]);
    await expect(labels(page, "queue")).toHaveText(["Deploy Queue", "Frontier Handoff", "Widget Work", "Backend Handoff", "Review Queue"]);
    await expect(page.locator(".ord-card, .ord-seats")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp("#/" + encodeURIComponent(CROWN) + "$"));
    for (const hidden of ["Idle Scout", "Stray Scribe", "Rival Crown"]) await expect(labels(page, "role").filter({ hasText: new RegExp(`^@${hidden}$`) })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await edgesThroughNodes(page)).toEqual([]);
    expect(await page.evaluate(() => (window as any).__csp)).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/order-graph-${info.project.name}-full.png`, fullPage: true });
  });

  test("keeps the graph and its detail apart by screen: side by side wide, stacked narrow", async ({ page }) => {
    await visit(page);
    const stage = await page.locator(".og-stage").boundingBox();
    const side = await page.locator(".og-side").boundingBox();
    const wide = (page.viewportSize()?.width ?? 0) > 900;
    if (wide) expect(side!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width - 1);
    else expect(side!.y).toBeGreaterThanOrEqual(stage!.y + stage!.height - 1);
    expect(stage!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(await page.evaluate(() => document.querySelector(".og-stage")!.scrollWidth)).toBeGreaterThan(0);
  });

  test("selects a node, lights its edges and dims the rest, and says what it is", async ({ page }, info) => {
    await visit(page);
    await named(page, "Frontier Knight", "aria").click();
    await expect(node(page, aria("02"))).toHaveClass(/og-sel/);
    await expect(detail(page).locator(".og-title")).toHaveText("Frontier Knight");
    await expect(detail(page).locator("[data-field=fanout] dd")).toHaveText("2 children · min 1 · max 2 · quota 4");
    await expect(page.locator(".og-node.og-dim").first()).toBeVisible();
    await expect(node(page, aria("01"))).not.toHaveClass(/og-dim/);
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(aria("02")) + "$"));
    await expect(detail(page).locator("[data-field=outgoing] a")).not.toHaveCount(0);
    await page.screenshot({ path: `test-results/order-graph-${info.project.name}-selected.png`, fullPage: true });
    await page.locator(".og-svg").click({ position: { x: 4, y: 4 } });
    await expect(page.locator(".og-sel")).toHaveCount(0);
    await expect(page.locator("[data-field=overview]")).toBeVisible();
  });

  test("follows a relation link to the node it names", async ({ page }) => {
    await visit(page);
    await named(page, "Crown", "aria").click();
    await detail(page).locator("[data-field=incoming] a", { hasText: "Review Queue" }).click();
    await expect(node(page, "@c0de0103")).toHaveClass(/og-sel/);
    await expect(detail(page).locator("[data-field=priority_map]")).toHaveText("by priority");
    await expect(detail(page).locator(".ord-row .ord-title")).toHaveText(["Review: loader retry policy", "Review: catalogue schema", "Review: docs wording"]);
  });

  test("switches relationships and views", async ({ page }, info) => {
    await visit(page);
    const lease = page.locator('[data-chip="lease"]');
    await lease.click();
    await expect(page.locator("[data-edge=lease].og-hide")).toHaveCount(4);
    await lease.click();
    await expect(page.locator("[data-edge=lease].og-hide")).toHaveCount(0);
    await page.getByRole("button", { name: "central command" }).click();
    await expect(page.locator("[data-node]")).toHaveCount(5);
    await expect(page).toHaveURL(/\?view=command$/);
    expect(await edgesThroughNodes(page)).toEqual([]);
    await page.screenshot({ path: `test-results/order-graph-${info.project.name}-command.png`, fullPage: true });
    await page.getByRole("button", { name: "full graph" }).click();
    await expect(page.locator("[data-node]")).toHaveCount(20);
  });

  test("opens in the command view and on a node straight from the address", async ({ page }) => {
    await visit(page, `#/${encodeURIComponent(CROWN)}?view=command`);
    await expect(page.locator('[data-field="graph"]')).toHaveAttribute("data-view", "command");
    await page.goto(`${origin}/#/${encodeURIComponent(CROWN)}/${encodeURIComponent("@c0de0105")}`);
    await expect(detail(page).locator(".og-title")).toHaveText("Backend Handoff");
    await expect(node(page, "@c0de0105")).toHaveClass(/og-sel/);
  });

  test("flags a seat drawn where its charter does not report, and only that seat", async ({ page }) => {
    await visit(page);
    await named(page, "@Widget Engineer", "role").click();
    await expect(detail(page).locator("[data-field=mismatch] dd")).toHaveText("drawn under Frontier Knight, charter says Frontier Strategist");
    await named(page, "@Bridge Knight", "role").click();
    await expect(detail(page).locator("[data-field=mismatch] dd")).toHaveText("drawn outside the command, charter says Crown");
    await named(page, "@Frontier Knight", "role").click();
    await expect(detail(page).locator("[data-field=mismatch]")).toHaveCount(0);
  });

  test("follows @topology live: an override dropped, a seat redrawn, a fan-out over its limit", async ({ page }) => {
    const { core } = await visit(page);
    const under = (a: string, b: string) => page.locator(`[data-edge=under][data-from="${a}"][data-to="${b}"]`);
    await expect(under(aria("02"), aria("05"))).toHaveCount(1);
    core.setTopology({});
    await expect(under(aria("02"), aria("05"))).toHaveCount(0);
    core.setTopology({ ...fixture.topology, [aria("05")]: aria("06") });
    await expect(under(aria("06"), aria("05"))).toHaveCount(1);
    core.setTopology({ ...fixture.topology, [aria("09")]: aria("02"), [aria("0b")]: aria("02") });
    await expect(named(page, "forks", "group")).toHaveClass(/og-tone-over/);
    await named(page, "@Frontier Knight", "role").click();
    await expect(detail(page).locator("[data-field=fanout] dd")).toHaveText("4 children · min 1 · max 2 · quota 4");
    await expect(detail(page).locator("[data-field=fanout]")).toHaveAttribute("data-tone", "lapsed");
  });

  test("renders the central command the address names, and says when it is not one", async ({ page }) => {
    await visit(page, `#/${encodeURIComponent("@c0de0099")}`, 5);
    await expect(labels(page, "role")).toHaveText(["@Rival Crown", "@Stray Scribe"]);
    await expect(labels(page, "queue")).toHaveText(["Rival Handoff"]);
    await page.goto(`${origin}/#/${encodeURIComponent("@c0de0002")}`);
    await expect(page.locator("[data-field=elsewhere]")).toContainText("Frontier Knight is not a central command");
    await expect(page.locator("[data-field=elsewhere] a")).toHaveAttribute("href", "#/" + encodeURIComponent(CROWN));
    await page.locator("[data-field=elsewhere] a").click();
    await expect(page.locator('[data-field="graph"]')).toHaveAttribute("data-central", CROWN);
  });

  test("draws a queue form's entries as a tree with state, owner, claim, lease, priority, attention and links", async ({ page }) => {
    await visit(page);
    await named(page, "Widget Work", "queue").click();
    const top = row(page, "Ship the widget catalogue");
    await expect(top).toHaveAttribute("data-state", "claimed");
    await expect(top).toHaveAttribute("data-attention", "owner");
    await expect(top.locator("[data-field=kind]")).toHaveText("work");
    await expect(top.locator("[data-field=state]")).toHaveText("claimed 2h");
    await expect(top.locator("[data-field=owner]")).toHaveText("owner Widget Engineer");
    await expect(top.locator("[data-field=claimed_by]")).toHaveText("claimed by zanni");
    await expect(top.locator("[data-field=lease]")).toHaveText("lease 35m");
    await expect(top.locator("[data-field=attention]")).toHaveText("attention: owner");
    await expect(top.locator("[data-field=links]")).toHaveText("2 links");
    await expect(top.locator("[data-field=children]")).toHaveText("3 children");
    const children = page.locator(".ord-item", { has: top }).first().locator("> .ord-tree > .ord-item > .ord-row .ord-title");
    await expect(children).toHaveText(["Catalogue schema", "Catalogue loader", "Catalogue page"]);
    await expect(row(page, "Catalogue schema").locator("[data-field=lease]")).toHaveText("lease lapsed 1h ago");
    await expect(row(page, "Retire the old widget index")).toHaveAttribute("data-state", "done");
    await expect(detail(page).locator("[data-field=counts]")).toContainText("2 need attention");
  });

  test("opens an entry with every field, its amendments and the body as a link", async ({ page }, info) => {
    await visit(page);
    await named(page, "Widget Work", "queue").click();
    await row(page, "Ship the widget catalogue").click();
    const sheet = page.getByRole("dialog", { name: "Work order" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(CROWN) + "/" + encodeURIComponent(widget.id) + "/" + entryId("Ship the widget catalogue")));
    for (const name of ["id", "kind", "state", "owner", "attention", "claimed_by", "children", "source", "requested_by", "principal", "repo", "branch", "commits", "body", "links"]) {
      await expect(sheet.locator(`[data-field="${name}"]`).first(), name).toBeVisible();
    }
    await expect(sheet.locator("[data-field=children] button")).toHaveText(["Catalogue schema", "Catalogue loader", "Catalogue page"]);
    await expect(sheet.locator("[data-field=claimed_by]")).toContainText("lease until");
    await expect(sheet.locator("[data-field=commits] code")).toHaveText(["4f1c9ad", "9be02e7"]);
    await expect(sheet.locator("[data-field=amendments-count]")).toHaveText("Amendments (2)");
    const body = sheet.locator("[data-field=body] a");
    await expect(body).toHaveAttribute("href", /^https:\/\/orders\.example\.test\/blob\//);
    await expect(body).toHaveAttribute("rel", "noopener noreferrer");
    await page.screenshot({ path: `test-results/order-graph-${info.project.name}-entry.png` });
    await sheet.locator("[data-field=children] button").first().click();
    await expect(sheet.locator(".ord-detail-title")).toHaveText("Catalogue schema");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("opens an entry straight from the address, and says when it has left the live queue", async ({ page }) => {
    await visit(page, `#/${encodeURIComponent(CROWN)}/${encodeURIComponent(widget.id)}/${entryId("Catalogue loader")}`);
    const sheet = page.getByRole("dialog", { name: "Work order" });
    await expect(sheet.locator(".ord-detail-title")).toHaveText("Catalogue loader");
    await expect(sheet.locator("[data-field=amendment]")).toContainText("Blocked on the schema review.");
    await page.goto(`${origin}/#/${encodeURIComponent(CROWN)}/${encodeURIComponent(widget.id)}/no-such-entry`);
    await expect(page.getByRole("dialog", { name: "Work order" })).toContainText("This entry has left the live queue.");
  });

  test("follows a queue form live: a changed state, a new entry and a retired one", async ({ page }) => {
    const { core } = await visit(page);
    await named(page, "Widget Work", "queue").click();
    const queue = { ...widget.form.queue! };
    const loader = Object.values(queue).find((e) => e.title === "Catalogue loader")!;
    await expect(row(page, "Catalogue loader").locator("[data-field=state]")).toContainText("blocked");
    queue[loader.id as string] = { ...loader, state: "claimed", state_at: "2026-11-25T20:29:00Z", claimed_by: { role: "Widget Engineer", aria: core.ids.engineer, at: "2026-11-25T20:29:00Z", lease_until: "2026-11-25T20:59:00Z" } };
    const fresh = "added-while-watching";
    queue[fresh] = { ...loader, id: fresh, title: "Added while watching", state: "posted", state_at: "2026-11-25T20:30:00Z", parent: entryId("Ship the widget catalogue"), claimed_by: undefined };
    const gone = entryId("Retire the old widget index");
    delete queue[gone];
    core.setRole(widget.id, { ...widget.form, queue });
    await expect(row(page, "Catalogue loader").locator("[data-field=state]")).toContainText("claimed 1m");
    await expect(page.locator(`.ord-row[data-entry="${fresh}"] .ord-title`)).toHaveText("Added while watching");
    await expect(page.locator(`.ord-row[data-entry="${gone}"]`)).toHaveCount(0);
  });

  test("shows hostile text as text and links only http and https", async ({ page }) => {
    const { core, errors } = await visit(page);
    await named(page, "Widget Work", "queue").click();
    const queue = { ...widget.form.queue! };
    const first = Object.values(queue)[0]!;
    queue[first.id as string] = { ...first, title: "<img src=x onerror=\"window.__pwned=1\">", links: ["javascript:window.__pwned=1", "https://keel.example.test/ok"], body: { uri: "garage://orders/abc", sha256: "c".repeat(64), bytes: 10 }, source: "github:javascript:alert(1)", detail: "<script>window.__pwned=1</script>" };
    core.setRole(widget.id, { ...widget.form, queue });
    const target = page.locator(`.ord-row[data-entry="${first.id}"]`);
    await expect(target.locator(".ord-title")).toHaveText(/<img src=x/);
    await target.click();
    const sheet = page.getByRole("dialog", { name: "Work order" });
    await expect(sheet.locator("[data-field=links] a")).toHaveCount(1);
    await expect(sheet.locator("[data-field=links] a")).toHaveAttribute("href", "https://keel.example.test/ok");
    await expect(sheet.locator("[data-field=body] a")).toHaveCount(0);
    await expect(sheet.locator("[data-field=detail]")).toContainText("<script>window.__pwned=1</script>");
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    expect(await page.evaluate(() => (window as any).__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
