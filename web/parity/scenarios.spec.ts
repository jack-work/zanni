import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, type Doc, type Step } from "./check";
import { readFacts } from "./facts";
import { fakeRpc, fakeSpeech, newFakeAria, relayRpc, test, expect } from "./fixtures";
import { realUnit, type Unit } from "./real";

const here = dirname(fileURLToPath(import.meta.url));
const doc: Doc = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8"));
const glyphs: Record<string, string> = JSON.parse(readFileSync(join(here, "glyphs.json"), "utf8"));
const real = process.env.PARITY_REAL === "1";
const shots = process.env.PARITY_SHOTS ?? join(here, "..", "test-results", "parity");

test.describe.configure({ mode: "serial" });

for (const scenario of doc.scenarios) {
  test(`${real ? "real" : "fake"}: ${scenario.id} (${scenario.slice})`, async ({ page }, info) => {
    const unit: Unit | null = real ? await realUnit(scenario) : null;
    let aria: string;
    if (unit) {
      aria = unit.aria;
      await relayRpc(page, unit.rpc, unit.headers);
    } else {
      const fake = newFakeAria();
      aria = fake.id;
      await fakeRpc(page, fake.core);
    }
    await fakeSpeech(page);
    const route = (name: string) => (name === "main" ? aria : aria);
    const act = async (d: Step["do"]): Promise<void> => {
      if (d.attend) {
        await page.goto(`/#/gluck/${route(d.attend)}`);
        await page.locator(".fw[data-link='live']").waitFor({ timeout: 20000 });
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
        const want = real ? step.expect : { ...step.expect, ...step.expect_fake };
        for (const gap of step.expect.web_gaps ?? []) info.annotations.push({ type: "web-gap", description: `${scenario.id}/${step.id}: ${gap.glyph}: ${gap.note}` });
        const problems = check(want, await readFacts(page), glyphs, !real);
        expect(problems, `${scenario.id}/${step.id}`).toEqual([]);
      }
    } finally {
      await unit?.release();
    }
  });
}
