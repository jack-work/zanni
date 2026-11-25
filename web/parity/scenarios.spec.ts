import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, type Doc, type Step } from "./check";
import { readFacts, type Facts } from "./facts";
import { fakeRpc, fakeSpeech, newFakeAria, relayRpc, test, expect } from "./fixtures";
import { realUnit, type Unit } from "./real";
import { store } from "./store";

const here = dirname(fileURLToPath(import.meta.url));
const doc: Doc = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8"));
const glyphs: Record<string, string> = JSON.parse(readFileSync(join(here, "glyphs.json"), "utf8"));
const real = process.env.PARITY_REAL === "1";
const FAKE_SCENARIOS = new Set(["attend", "send", "streamed", "steering"]);
const shots = process.env.PARITY_SHOTS ?? join(here, "..", "test-results", "parity");

const flatten = (v: unknown): Record<string, unknown> => {
  const flat: Record<string, unknown> = {};
  const walk = (prefix: string, x: unknown) => {
    if (x && typeof x === "object" && !Array.isArray(x)) for (const [k, y] of Object.entries(x)) walk(prefix ? `${prefix}.${k}` : k, y);
    else flat[prefix] = x;
  };
  walk("", v);
  return flat;
};

for (const scenario of doc.scenarios) {
  test(`${real ? "real" : "fake"}: ${scenario.id} (${scenario.slice})`, async ({ page }, info) => {
    test.skip(!real && !FAKE_SCENARIOS.has(scenario.id), "the mock aria does not model this scenario");
    const unit: Unit | null = real ? await realUnit(scenario) : null;
    let aria: string;
    let fake_core: ReturnType<typeof newFakeAria>["core"] | null = null;
    if (unit) {
      aria = unit.aria;
      await relayRpc(page, unit.rpc, unit.headers);
    } else {
      const fake = newFakeAria(doc);
      fake_core = fake.core;
      aria = fake.id;
      await fakeRpc(page, fake.core);
    }
    await fakeSpeech(page);
    const ids: Record<string, string> = { main: aria };
    const route = (name: string) => ids[name] ?? name;
    const current = () => route(attended);
    let attended = "main";
    const openPit = async () => {
      const panel = page.locator(".zr-pit[role=dialog]");
      if (await panel.count()) return;
      await page.locator("[data-testid=pit-grip]").click();
      await panel.waitFor();
    };
    const closePit = async () => {
      if (!(await page.locator(".zr-pit[role=dialog]").count())) return;
      await page.keyboard.press("Escape");
      await page.locator(".zr-pit[role=dialog]").waitFor({ state: "detached" }).catch(() => undefined);
    };
    const typeCommand = async (line: string) => {
      const box = page.locator("textarea.zr-input");
      await box.click();
      await page.keyboard.type(":" + line);
    };
    const act = async (d: Step["do"]): Promise<void> => {
      if (d.attend) {
        attended = d.attend;
        await page.goto(`/#/${store}/${route(d.attend)}`);
        await page.locator(".fw[data-link='live']").waitFor({ timeout: 20000 });
      }
      if (d.set) unit!.fig("set", "--id", current(), d.set.key, d.set.value);
      if (d.fork) {
        const before = new Set((unit!.figJson("list", "-j") ?? []).map((a: { id: string }) => a.id));
        await closePit();
        await typeCommand(`fork :${d.fork.at_turn}`);
        await page.keyboard.press("Enter");
        const end = Date.now() + 15000;
        while (Date.now() < end && !ids[d.fork.as]) {
          const fresh = (unit!.figJson("list", "-j") ?? []).find((a: { id: string; parent?: string }) => !before.has(a.id) && a.parent === route(d.fork.aria));
          if (fresh) ids[d.fork.as] = fresh.id;
          else await page.waitForTimeout(200);
        }
        if (!ids[d.fork.as]) throw new Error(`no fork of ${d.fork.aria} appeared`);
      }
      if (d.pit === "close") await closePit();
      else if (d.pit) {
        await openPit();
        const back = page.locator(".fw-pit-back");
        if (await back.count()) await back.click();
        if (d.pit !== "control") await page.locator(`.zr-pit-row[data-action=${d.pit}]`).click({ timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(900);
      }
      if (d.command_typed) {
        await closePit();
        await typeCommand(d.command_typed);
      }
      if (d.command_enter) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(800);
      }
      if (d.send) {
        const box = page.locator("textarea.zr-input");
        await box.fill(d.send);
        await page.locator("button.zr-send").click();
      }
      if (d.wait === "running") await page.locator(".fw[data-running]").waitFor({ timeout: 20000 });
      if (d.wait === "idle") {
        await page.locator(".nodi-turn").first().waitFor({ timeout: 20000 });
        await expect(page.locator(".fw")).not.toHaveAttribute("data-running", /.*/, { timeout: (d.timeout ?? 20) * 1000 });
      }
      if (d.sleep) await page.waitForTimeout(d.sleep * 1000);
      if (d.then) await act(d.then);
    };
    try {
      for (const step of scenario.steps) {
        await act(step.do);
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(shots, info.project.name, scenario.id, `${step.id}.png`), fullPage: false });
        const want = step.expect;
        for (const gap of step.expect.web_gaps ?? []) info.annotations.push({ type: "web-gap", description: `${scenario.id}/${step.id}: ${gap.glyph}: ${gap.note}` });
        for (const turn of want.turns ?? []) {
          if (!turn.deltas) continue;
          const toggle = page.locator(`.nodi-turn[data-turn="${turn.turn}"] .nodi-turn-delta`);
          if ((await toggle.count()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
        }
        const facts: Facts = await readFacts(page);
        if (unit) {
          facts.state = flatten(unit.figJson("state", "show", "--id", current(), "-j") ?? {});
          const byId = new Map(Object.entries(ids).map(([name, id]) => [id, name]));
          facts.tree = { edges: (unit.figJson("list", "-j") ?? []).filter((a: { id: string; parent?: string }) => byId.has(a.id) && byId.has(a.parent ?? "")).map((a: { id: string; parent: string }) => [byId.get(a.parent)!, byId.get(a.id)!]).sort() };
        }
        if (fake_core) facts.state = flatten(fake_core.formOf(current()) ?? {});
        const problems = check(want, facts, glyphs, !real, doc.labels);
        expect.soft(problems, `${scenario.id}/${step.id}`).toEqual([]);
      }
    } finally {
      await unit?.release();
    }
  });
}
