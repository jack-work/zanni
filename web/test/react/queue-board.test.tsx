import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEPLOY_STEPS, QueueBoard, boardCell, formatDuration, formatRate, sinceOf, type DeploysResponse } from "zanni-react";
import fixture from "../fixtures/deploys.json";

const data = fixture as DeploysResponse;
const props = { data, env: "dev" as const, onEnv: () => {}, since: "7d" as const, onSince: () => {} };

describe("QueueBoard", () => {
  it("draws one row per commit and one column per step, in order", () => {
    render(<QueueBoard {...props} />);
    const heads = [...document.querySelectorAll<HTMLElement>("thead .zr-qb-step")].map((h) => h.dataset.step);
    expect(heads).toEqual([...DEPLOY_STEPS]);
    const rows = document.querySelectorAll<HTMLElement>("tbody .zr-qb-row");
    expect(rows.length).toBe(data.commits.length);
    expect(rows[0]!.dataset.trace).toBe(data.commits[0]!.trace);
    expect(rows[0]!.querySelectorAll(".zr-qb-cell").length).toBe(DEPLOY_STEPS.length);
  });

  it("shows the short sha, repo and ref on the row head", () => {
    render(<QueueBoard {...props} />);
    const head = document.querySelector<HTMLElement>(".zr-qb-row .zr-qb-commit")!;
    const c = data.commits[0]!;
    expect(head.querySelector(".zr-qb-sha")!.textContent).toBe(c.sha.slice(0, 7));
    expect(head.querySelector(".zr-qb-repo")!.textContent).toBe(c.repo);
    expect(head.querySelector(".zr-qb-ref")!.textContent).toBe(c.ref);
  });

  it("marks each cell with its outcome and duration, and leaves absent steps empty", () => {
    render(<QueueBoard {...props} />);
    const failed = data.commits.find((c) => c.ref === "lane/forms-signedout")!;
    const row = document.querySelector<HTMLElement>(`[data-trace="${failed.trace}"]`)!;
    const cells = [...row.querySelectorAll<HTMLElement>(".zr-qb-cell")];
    expect(cells.map((c) => c.dataset.outcome ?? "empty")).toEqual(["ok", "ok", "ok", "fail", "empty", "empty", "empty"]);
    expect(cells[3]!.querySelector(".zr-qb-dur")!.textContent).toBe("5m41s");
    const skipped = document.querySelector<HTMLElement>(`[data-trace="${data.commits.find((c) => c.ref === "master" && c.repo === "figscope")!.trace}"]`)!;
    const skip = skipped.querySelectorAll<HTMLElement>(".zr-qb-cell")[1]!;
    expect(skip.dataset.outcome).toBe("skip");
    expect(skip.querySelector(".zr-qb-dur")!.textContent).toBe("skip");
  });

  it("carries site, unit, actor, cand and box in the cell's tooltip", () => {
    render(<QueueBoard {...props} />);
    const prod = data.commits.find((c) => c.ref === "dev" && c.repo === "zanni")!;
    const cell = document.querySelector<HTMLElement>(`[data-trace="${prod.trace}"]`)!.querySelectorAll<HTMLElement>(".zr-qb-cell")[5]!;
    for (const want of ["site fig.kelliher.info", "unit figchat", "actor el-zapador", "cand c-0612", "box spain"]) expect(cell.title).toContain(want);
  });

  it("folds several spans of one step into one cell: worst outcome, last duration, a count", () => {
    const multi = data.commits.find((c) => c.repo === "spain-flake")!;
    const cell = boardCell(multi, "prod_deploy")!;
    expect(cell.spans.length).toBe(2);
    expect(cell.duration_ms).toBe(64000);
    const failing = { ...multi, steps: multi.steps.map((s, i) => (s.step === "prod_deploy" && i % 2 === 0 ? { ...s, outcome: "fail" as const } : s)) };
    expect(boardCell(failing, "prod_deploy")!.outcome).toBe("fail");
    expect(boardCell(multi, "queue")!.spans.length).toBe(1);
    expect(boardCell({ ...multi, steps: [] }, "queue")).toBeNull();
    render(<QueueBoard {...props} />);
    expect(document.querySelector(`[data-trace="${multi.trace}"] .zr-qb-n`)!.textContent).toBe("\u00d72");
  });

  it("heads each step with count, failure rate, p50 and p95", () => {
    render(<QueueBoard {...props} />);
    const build = document.querySelector<HTMLElement>('thead [data-step="build"]')!;
    const r = data.steps.find((s) => s.step === "build")!;
    expect(build.querySelector('[data-stat="count"]')!.textContent).toBe(String(r.count));
    expect(build.querySelector('[data-stat="rate"]')!.textContent).toBe(formatRate(r.failure_rate));
    expect(build.querySelector('[data-stat="p50"]')!.textContent).toBe("p50 " + formatDuration(r.p50_ms));
    expect(build.querySelector('[data-stat="p95"]')!.textContent).toBe("p95 " + formatDuration(r.p95_ms));
    expect(build.hasAttribute("data-failing")).toBe(true);
    expect(document.querySelector('thead [data-step="queue"]')!.hasAttribute("data-failing")).toBe(false);
  });

  it("toggles env and since through callbacks and reports the pressed one", () => {
    const onEnv = vi.fn();
    const onSince = vi.fn();
    render(<QueueBoard {...props} onEnv={onEnv} onSince={onSince} />);
    const env = within(screen.getByRole("group", { name: "Environment" }));
    expect(env.getByRole("button", { name: "dev" }).getAttribute("aria-pressed")).toBe("true");
    expect(env.getByRole("button", { name: "prod" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(env.getByRole("button", { name: "prod" }));
    expect(onEnv).toHaveBeenCalledWith("prod");
    const since = within(screen.getByRole("group", { name: "Since" }));
    expect(since.getByRole("button", { name: "7d" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(since.getByRole("button", { name: "24h" }));
    expect(onSince).toHaveBeenCalledWith("24h");
  });

  it("says what it is waiting on: loading, an error, or an empty window", () => {
    const { rerender } = render(<QueueBoard {...props} data={null} loading />);
    expect(screen.getByRole("status").textContent).toBe("loading");
    rerender(<QueueBoard {...props} data={null} error="deploys: HTTP 502" />);
    expect(screen.getByRole("status").textContent).toBe("deploys: HTTP 502");
    rerender(<QueueBoard {...props} data={{ ...data, commits: [], steps: [] }} />);
    expect(document.querySelector(".zr-qb-empty")!.textContent).toBe("No deploys in this window.");
    expect(document.querySelectorAll("thead .zr-qb-step").length).toBe(DEPLOY_STEPS.length);
  });

  it("renders a hostile repo name as text with its controls made visible", () => {
    const evil = { ...data, commits: [{ ...data.commits[0]!, repo: "<img src=x onerror=alert(1)>\u202E" }] };
    render(<QueueBoard {...props} data={evil} />);
    expect(document.querySelector(".zr-qb img")).toBeNull();
    expect(document.querySelector(".zr-qb-repo .nodi-ctl")).toBeTruthy();
  });
});

describe("queue board numbers", () => {
  it("formats durations at each scale", () => {
    expect([0, 850, 1200, 12000, 61000, 341000, 3_720_000].map(formatDuration)).toEqual(["0ms", "850ms", "1.2s", "12s", "1m01s", "5m41s", "1h02m"]);
  });

  it("formats rates, keeping a decimal below ten percent", () => {
    expect([0, 0.04, 0.25, 0.5, 1].map(formatRate)).toEqual(["0%", "4%", "25%", "50%", "100%"]);
    expect(formatRate(1 / 24)).toBe("4.2%");
  });

  it("turns a window into an RFC3339 instant before now", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(sinceOf("24h", now)).toBe("2026-11-23T12:00:00.000Z");
    expect(sinceOf("14d", now)).toBe("2026-11-10T12:00:00.000Z");
  });
});
