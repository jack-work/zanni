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
const seat = (page: Page, hex: string) => page.locator(`.ord-seat[data-aria="${aria(hex)}"]`);
const names = (page: Page) => page.locator(".ord-role-name");
const queueNames = (page: Page) => page.locator(".ord-queue-name");
const queueForm = (page: Page, name: string) => page.locator(".ord-queue", { has: page.locator(".ord-queue-name", { hasText: new RegExp(`^${name}$`) }) });
const entryId = (title: string): string => Object.values(widget.form.queue!).find((e) => e.title === title)!.id as string;
const row = (page: Page, title: string) => page.locator(`.ord-row[data-entry="${entryId(title)}"]`);
const role = (page: Page, name: string) => page.locator(".ord-role", { has: page.locator(".ord-role-name", { hasText: new RegExp(`^${name}$`) }) });

async function visit(page: Page, hash = ""): Promise<{ core: ReturnType<typeof mock.create>; errors: string[] }> {
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
  await page.locator(".ord-role").first().waitFor();
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

test.describe("the order page against the fake door", () => {
  test("draws the chartered tree of one central command and fits the screen", async ({ page }, info) => {
    const { errors } = await visit(page);
    await settle(page);
    await expect(names(page)).toHaveText(["Crown", "Frontier Knight", "Frontier Strategist", "Widget Engineer", "Edge Engineer", "Bridge Knight", "Backend Lead", "Lost Lead"]);
    await expect(queueNames(page)).toHaveText(["Deploy Queue", "Frontier Handoff", "Widget Work", "Backend Handoff", "Review Queue"]);
    await expect(page.locator("[data-field=central]").first()).toHaveText("Central command: Crown");
    await expect(page).toHaveURL(new RegExp("#/" + encodeURIComponent(CROWN) + "$"));
    await expect(role(page, "Widget Engineer").locator("[data-field=holder]")).toHaveText("held by forms-aria lane");
    await expect(queueForm(page, "Widget Work").locator("[data-field=counts]")).toContainText("1 blocked");
    await expect(queueForm(page, "Widget Work").locator("[data-field=counts]")).toContainText("2 need attention");
    await expect(role(page, "Backend Lead").locator("[data-field=holder]")).toHaveText("vacant");
    for (const hidden of ["Idle Scout", "Stray Scribe", "Rival Crown"]) await expect(names(page).filter({ hasText: new RegExp(`^${hidden}$`) })).toHaveCount(0);
    await expect(queueNames(page).filter({ hasText: "Rival Handoff" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => (window as any).__csp)).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/order-topology-${info.project.name}-tree.png`, fullPage: true });
  });

  test("hangs each seat from its nearest chartered ancestor in the drawn tree", async ({ page }) => {
    await visit(page);
    await expect(seat(page, "01").locator("> .ord-seats > .ord-seat > .ord-role .ord-role-name")).toHaveText(["Frontier Knight", "Edge Engineer"]);
    await expect(seat(page, "02").locator("> .ord-seats > .ord-seat > .ord-role .ord-role-name")).toHaveText(["Frontier Strategist", "Widget Engineer"]);
    await expect(seat(page, "05").locator("> .ord-seats")).toHaveCount(0);
    await expect(role(page, "Widget Engineer").locator("[data-field=skipped]")).toHaveText("skips 1 unchartered");
    await expect(role(page, "Frontier Knight").locator("[data-field=fanout]")).toHaveText("2 children · min 1 · max 2 · quota 4");
    await expect(role(page, "Frontier Knight").locator("[data-field=seat]")).toHaveText("knight");
    await expect(role(page, "Frontier Knight").locator("[data-field=regiment]")).toHaveText("frontend");
    await expect(page.locator("[data-field=apart] .ord-role-name")).toHaveText(["Bridge Knight"]);
    await expect(page.locator("[data-field=vacant] .ord-role-name")).toHaveText(["Backend Lead", "Lost Lead"]);
  });

  test("draws each queue form under its role and links the roles that study it", async ({ page }) => {
    await visit(page);
    await expect(seat(page, "05").locator("> .ord-forms .ord-queue-name")).toHaveText(["Widget Work"]);
    await expect(seat(page, "06").locator("> .ord-forms .ord-queue-name")).toHaveText(["Frontier Handoff"]);
    await expect(seat(page, "02").locator("> .ord-forms .ord-queue-name")).toHaveText(["Deploy Queue"]);
    await expect(page.locator("[data-field=strays] .ord-queue-name")).toHaveText(["Review Queue"]);
    await expect(queueForm(page, "Review Queue").locator("[data-field=priority_map]")).toHaveText("by priority");
    const studies = role(page, "Crown").locator("[data-field=study]");
    await expect(studies).toHaveText(["studies Review Queue", "studies c0de0fff (not visible)"]);
    await studies.first().locator("a").click();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(CROWN) + "/" + encodeURIComponent("@c0de0103") + "$"));
    await expect(queueForm(page, "Review Queue")).toHaveAttribute("data-focused", "true");
    await expect(queueForm(page, "Review Queue")).toHaveAttribute("open", "");
    await expect(queueForm(page, "Review Queue").locator(".ord-row .ord-title")).toHaveText(["Review: loader retry policy", "Review: catalogue schema", "Review: docs wording"]);
  });

  test("flags a seat drawn where its charter does not report, and only that seat", async ({ page }) => {
    await visit(page);
    await expect(role(page, "Widget Engineer").locator("[data-field=mismatch]")).toHaveText("drawn under Frontier Knight, charter says Frontier Strategist");
    await expect(role(page, "Bridge Knight").locator("[data-field=mismatch]")).toHaveText("drawn outside the command, charter says Crown");
    await expect(page.locator("[data-field=mismatch]")).toHaveCount(2);
  });

  test("follows @topology live: an override dropped, a seat redrawn, a fan-out over its limit", async ({ page }) => {
    const { core } = await visit(page);
    core.setTopology({});
    await expect(page.locator("[data-field=apart] .ord-role-name")).toHaveText(["Bridge Knight", "Widget Engineer"]);
    await expect(role(page, "Frontier Knight").locator("[data-field=fanout]")).toHaveText("1 child · min 1 · max 2 · quota 4");
    await expect(role(page, "Widget Engineer").locator("[data-field=skipped]")).toHaveCount(0);

    core.setTopology({ ...fixture.topology, [aria("05")]: aria("06") });
    await expect(role(page, "Widget Engineer").locator("[data-field=mismatch]")).toHaveCount(0);
    await expect(seat(page, "06").locator("> .ord-seats > .ord-seat > .ord-role .ord-role-name")).toHaveText(["Widget Engineer"]);

    core.setTopology({ ...fixture.topology, [aria("09")]: aria("02"), [aria("0b")]: aria("02") });
    const fan = role(page, "Frontier Knight").locator("[data-field=fanout]");
    await expect(fan).toHaveText("4 children · min 1 · max 2 · quota 4");
    await expect(fan).toHaveAttribute("data-tone", "lapsed");
  });

  test("renders the central command the address names, and says when it is not one", async ({ page }) => {
    await visit(page, `#/${encodeURIComponent("@c0de0099")}`);
    await expect(names(page)).toHaveText(["Rival Crown", "Stray Scribe"]);
    await expect(queueNames(page)).toHaveText(["Rival Handoff"]);
    await page.goto(`${origin}/#/${encodeURIComponent("@c0de0002")}`);
    await expect(page.locator("[data-field=elsewhere]")).toContainText("Frontier Knight is not a central command");
    await expect(page.locator("[data-field=elsewhere] a")).toHaveAttribute("href", "#/" + encodeURIComponent(CROWN));
    await page.locator("[data-field=elsewhere] a").click();
    await expect(page.locator("[data-field=central]").first()).toHaveText("Central command: Crown");
  });

  test("draws a role's entries as a tree with state, owner, claim, lease, priority, attention and links", async ({ page }) => {
    await visit(page);
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
    const grand = page.locator(".ord-item", { has: row(page, "Catalogue page") }).last().locator("> .ord-tree > .ord-item > .ord-row .ord-title");
    await expect(grand).toHaveText(["Page: empty state"]);

    await expect(row(page, "Catalogue schema").locator("[data-field=lease]")).toHaveText("lease lapsed 1h ago");
    await expect(row(page, "Retire the old widget index")).toHaveAttribute("data-state", "done");

    const review = queueForm(page, "Review Queue").locator(".ord-row");
    await expect(review.locator(".ord-title")).toHaveText(["Review: loader retry policy", "Review: catalogue schema", "Review: docs wording"]);
    await expect(review.first().locator("[data-field=priority]")).toHaveText("priority 20");
  });

  test("opens an entry with every field, its amendments and the body as a link", async ({ page }, info) => {
    await visit(page);
    await row(page, "Ship the widget catalogue").click();
    const sheet = page.getByRole("dialog", { name: "Work order" });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(CROWN) + "/" + encodeURIComponent(widget.id) + "/" + entryId("Ship the widget catalogue")));
    for (const name of ["id", "kind", "state", "owner", "attention", "claimed_by", "parent", "children", "source", "requested_by", "principal", "repo", "branch", "commits", "body", "links"]) {
      if (name === "parent") continue;
      await expect(sheet.locator(`[data-field="${name}"]`).first(), name).toBeVisible();
    }
    await expect(sheet.locator("[data-field=children] button")).toHaveText(["Catalogue schema", "Catalogue loader", "Catalogue page"]);
    await expect(sheet.locator("[data-field=claimed_by]")).toContainText("lease until");
    await expect(sheet.locator("[data-field=claimed_by]")).toContainText("in 35m");
    await expect(sheet.locator("[data-field=commits] code")).toHaveText(["4f1c9ad", "9be02e7"]);
    await expect(sheet.locator("[data-field=amendments-count]")).toHaveText("Amendments (2)");
    await expect(sheet.locator("[data-field=amendment]")).toHaveCount(2);
    await expect(sheet.locator("[data-field=amendment]").nth(1)).toContainText("The loader waits on the schema");
    const body = sheet.locator("[data-field=body] a");
    await expect(body).toHaveAttribute("href", /^https:\/\/orders\.example\.test\/blob\//);
    await expect(body).toHaveAttribute("rel", "noopener noreferrer");
    await expect(sheet.locator("[data-field=links] a")).toHaveCount(2);
    await page.screenshot({ path: `test-results/order-queues-${info.project.name}-detail.png` });

    await sheet.locator("[data-field=children] button").first().click();
    await expect(sheet.locator(".ord-detail-title")).toHaveText("Catalogue schema");
    await expect(sheet.locator("[data-field=parent] button")).toHaveText("Ship the widget catalogue");
    await expect(sheet.locator("[data-field=review]")).toContainText("needed: yes");

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("opens straight from the address", async ({ page }) => {
    await visit(page, `#/${encodeURIComponent(CROWN)}/${encodeURIComponent(widget.id)}/${entryId("Catalogue loader")}`);
    const sheet = page.getByRole("dialog", { name: "Work order" });
    await expect(sheet.locator(".ord-detail-title")).toHaveText("Catalogue loader");
    await expect(sheet.locator("[data-field=amendment]")).toContainText("Blocked on the schema review.");
  });

  test("follows the role form live: a changed state, a new entry, a retired one and a new role", async ({ page }) => {
    const { core } = await visit(page);
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
    await expect(row(page, "Catalogue loader").locator("[data-field=claimed_by]")).toContainText("claimed by");
    await expect(page.locator(`.ord-row[data-entry="${fresh}"] .ord-title`)).toHaveText("Added while watching");
    await expect(page.locator(`.ord-row[data-entry="${gone}"]`)).toHaveCount(0);
    await expect(queueForm(page, "Widget Work").locator("[data-field=counts]")).not.toContainText("1 done");

    core.addRole({ id: "@7e1a0009", name: "Late Lead", target: aria("0b"), form: { name: "Late Lead", "role-name": "Late Lead", "target-aria": aria("0b"), chartered: { seat: "lead", regiment: "frontend", root: "@c0de0001", "reports-to": "@c0de0002" } } });
    await expect(seat(page, "02").locator("> .ord-seats > .ord-seat > .ord-role .ord-role-name")).toHaveText(["Frontier Strategist", "Late Lead", "Widget Engineer"]);
    core.addRole({ id: "@7e1a0008", name: "Unchartered Lead", target: aria("0d"), form: { name: "Unchartered Lead", "role-name": "Unchartered Lead", "target-aria": aria("0d") } });
    await expect(names(page)).toHaveCount(9);
  });

  test("shows hostile text as text and links only http and https", async ({ page }) => {
    const { core, errors } = await visit(page);
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
    await expect(sheet.locator("[data-field=body]")).toContainText("garage://orders/abc");
    await expect(sheet.locator("[data-field=source] a")).toHaveCount(0);
    await expect(sheet.locator("[data-field=detail]")).toContainText("<script>window.__pwned=1</script>");
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    expect(await page.evaluate(() => (window as any).__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("says so when the entry has left the live queue", async ({ page }) => {
    await visit(page, `#/${encodeURIComponent(CROWN)}/${encodeURIComponent(widget.id)}/no-such-entry`);
    await expect(page.getByRole("dialog", { name: "Work order" })).toContainText("This entry has left the live queue.");
  });
});
