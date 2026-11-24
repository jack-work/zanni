import type { ReactNode } from "react";
import { Button, ButtonGroup } from "./button";
import { glyphs } from "./glyphs";
import { Plain } from "./text";

export const DEPLOY_STEPS = ["queue", "review", "merge", "build", "dev_deploy", "prod_deploy", "cut"] as const;
export type DeployStepName = (typeof DEPLOY_STEPS)[number];
export type DeployOutcome = "ok" | "fail" | "skip";
export type DeployEnv = "dev" | "prod";

export const SINCE_WINDOWS = [
  { key: "24h", ms: 24 * 3_600_000 },
  { key: "7d", ms: 7 * 86_400_000 },
  { key: "14d", ms: 14 * 86_400_000 },
] as const;
export type SinceKey = (typeof SINCE_WINDOWS)[number]["key"];

export interface DeploySpan {
  step: DeployStepName;
  span?: string;
  start?: string;
  end?: string;
  duration_ms: number;
  outcome: DeployOutcome;
  site?: string;
  unit?: string;
  actor?: string;
  actor_aria?: string;
  repo?: string;
  ref?: string;
  sha?: string;
  merge_sha?: string;
  cand?: string;
  box?: string;
}

export interface DeployCommit {
  trace: string;
  sha: string;
  repo?: string;
  ref?: string;
  first?: string;
  last?: string;
  steps: DeploySpan[];
}

export interface StepRollup {
  step: DeployStepName;
  count: number;
  ok: number;
  fail: number;
  skip: number;
  p50_ms: number;
  p95_ms: number;
  failure_rate: number;
}

export interface DeploysResponse {
  env: DeployEnv;
  since: string;
  commits: DeployCommit[];
  steps: StepRollup[];
}

export function sinceOf(key: SinceKey, now: number): string {
  const w = SINCE_WINDOWS.find((x) => x.key === key) ?? SINCE_WINDOWS[1];
  return new Date(now - w.ms).toISOString();
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return Math.round(ms) + "ms";
  const s = ms / 1000;
  if (s < 10) return s.toFixed(1) + "s";
  if (s < 60) return Math.round(s) + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m" + String(Math.round(s - m * 60)).padStart(2, "0") + "s";
  return Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0") + "m";
}

export function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  const pct = rate * 100;
  return (pct < 10 && pct !== Math.round(pct) ? pct.toFixed(1) : String(Math.round(pct))) + "%";
}

export interface BoardCell {
  step: DeployStepName;
  outcome: DeployOutcome;
  duration_ms: number;
  spans: DeploySpan[];
}

export function boardCell(commit: DeployCommit, step: DeployStepName): BoardCell | null {
  const spans = commit.steps.filter((s) => s.step === step);
  if (!spans.length) return null;
  const last = spans.reduce((a, b) => ((b.end ?? "") >= (a.end ?? "") ? b : a));
  const outcome: DeployOutcome = spans.some((s) => s.outcome === "fail") ? "fail" : spans.some((s) => s.outcome === "ok") ? "ok" : "skip";
  return { step, outcome, duration_ms: last.duration_ms, spans };
}

const ATTRS = ["site", "unit", "actor", "cand", "box"] as const;

export function cellTitle(cell: BoardCell): string {
  return cell.spans
    .map((s) => [s.step + " " + s.outcome + " " + formatDuration(s.duration_ms), ...ATTRS.filter((k) => s[k]).map((k) => k + " " + s[k])].join("\n"))
    .join("\n\n");
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

const MARK: Record<DeployOutcome, string> = { ok: glyphs["tool.ok"], fail: glyphs["tool.error"], skip: "\u2013" };

function Cell({ cell }: { cell: BoardCell | null }): ReactNode {
  if (!cell) return <td className="zr-qb-cell" data-empty="" />;
  const duration = cell.outcome === "skip" ? "skip" : formatDuration(cell.duration_ms);
  const repeats = cell.spans.length > 1 ? "\u00d7" + cell.spans.length : "";
  return (
    <td className="zr-qb-cell" data-outcome={cell.outcome} title={cellTitle(cell)} tabIndex={0} aria-label={[cell.step, cell.outcome, duration, repeats].filter(Boolean).join(" ")}>
      <span className="zr-qb-mark" aria-hidden="true">
        {MARK[cell.outcome]}
      </span>
      <span className="zr-qb-dur">{duration}</span>
      {repeats && <span className="zr-qb-n">{repeats}</span>}
    </td>
  );
}

function HeadCell({ step, rollup }: { step: DeployStepName; rollup: StepRollup | undefined }): ReactNode {
  const failing = !!rollup && rollup.fail > 0;
  return (
    <th scope="col" className="zr-qb-step" data-step={step} data-failing={failing ? "" : undefined}>
      <span className="zr-qb-step-name">{step.replace("_", " ")}</span>
      <span className="zr-qb-stat" data-stat="count">
        {rollup ? rollup.count : 0}
      </span>
      <span className="zr-qb-stat" data-stat="rate">
        {rollup ? formatRate(rollup.failure_rate) : "\u2013"}
      </span>
      <span className="zr-qb-stat" data-stat="p50">
        {rollup && rollup.count ? "p50 " + formatDuration(rollup.p50_ms) : "\u2013"}
      </span>
      <span className="zr-qb-stat" data-stat="p95">
        {rollup && rollup.count ? "p95 " + formatDuration(rollup.p95_ms) : "\u2013"}
      </span>
    </th>
  );
}

export interface QueueBoardProps {
  data: DeploysResponse | null;
  env: DeployEnv;
  onEnv: (env: DeployEnv) => void;
  since: SinceKey;
  onSince: (since: SinceKey) => void;
  loading?: boolean;
  error?: string;
  label?: string;
}

export function QueueBoard({ data, env, onEnv, since, onSince, loading, error, label = "Merge queue" }: QueueBoardProps) {
  const rollups = new Map((data?.steps ?? []).map((r) => [r.step, r] as const));
  const commits = data?.commits ?? [];
  return (
    <section className="zr-qb" aria-label={label} aria-busy={loading ? "true" : undefined}>
      <div className="zr-qb-bar">
        <ButtonGroup label="Environment">
          {(["dev", "prod"] as const).map((e) => (
            <Button key={e} size="compact" variant="quiet" aria-pressed={env === e} onClick={() => onEnv(e)}>
              {e}
            </Button>
          ))}
        </ButtonGroup>
        <ButtonGroup label="Since">
          {SINCE_WINDOWS.map((w) => (
            <Button key={w.key} size="compact" variant="quiet" aria-pressed={since === w.key} onClick={() => onSince(w.key)}>
              {w.key}
            </Button>
          ))}
        </ButtonGroup>
        <span className="zr-qb-note" role="status">
          {error ? <span data-tone="fail">{error}</span> : loading ? "loading" : data ? commits.length + (commits.length === 1 ? " commit" : " commits") : ""}
        </span>
      </div>
      <div className="zr-qb-scroll">
        <table className="zr-qb-table">
          <thead>
            <tr>
              <th scope="col" className="zr-qb-commit-head">
                <span className="zr-qb-step-name">commit</span>
                <span className="zr-qb-stat">count</span>
                <span className="zr-qb-stat">failed</span>
                <span className="zr-qb-stat">p50</span>
                <span className="zr-qb-stat">p95</span>
              </th>
              {DEPLOY_STEPS.map((s) => (
                <HeadCell key={s} step={s} rollup={rollups.get(s)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {commits.map((c) => (
              <tr key={c.trace} className="zr-qb-row" data-trace={c.trace}>
                <th scope="row" className="zr-qb-commit" title={c.sha + (c.first ? "\n" + c.first : "") + (c.last ? "\n" + c.last : "")}>
                  <span className="zr-qb-sha">{shortSha(c.sha)}</span>
                  <span className="zr-qb-repo">{c.repo && <Plain text={c.repo} />}</span>
                  <span className="zr-qb-ref">{c.ref && <Plain text={c.ref} />}</span>
                </th>
                {DEPLOY_STEPS.map((s) => (
                  <Cell key={s} cell={boardCell(c, s)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data && !commits.length && !error && <p className="zr-qb-empty">No deploys in this window.</p>}
      </div>
    </section>
  );
}
