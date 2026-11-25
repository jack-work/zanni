import type { Dial } from "figaro-forms";
import { sessionHeaders, sessionId } from "./session";

export type ActionName = "send" | "speak" | "dictate" | "fork" | "attach";

export const SERVICE_NAME = "figaro-web";
export const FLUSH_MS = 10_000;
export const JOIN_WINDOW_MS = 120_000;
export const ACTION_CAP_MS = 330_000;
export const BATCH = 100;
export const KEEP = 512;

export interface Action {
  readonly name: ActionName;
  readonly traceId: string;
  readonly spanId: string;
  readonly traceparent: string;
  end(failure?: unknown): void;
}

interface Attr {
  readonly key: string;
  readonly value: { readonly stringValue: string } | { readonly intValue: string };
}

const text = (key: string, value: string): Attr => ({ key, value: { stringValue: value } });
const whole = (key: string, value: number): Attr => ({ key, value: { intValue: String(value) } });

let endpoints: { readonly traces: string; readonly logs: string } | null = null;
let spans: object[] = [];
let logs: object[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let dead = false;
let warned = false;
let hooked = false;
let last: { readonly action: Action; endedAt: number } | null = null;

const hex = (bytes: number): string => {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  if (raw.every((b) => b === 0)) raw[0] = 1;
  return Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("");
};

const nanos = (): string => String(Math.round((performance.timeOrigin + performance.now()) * 1000)) + "000";

export function failureKind(err: unknown): { type: string; status: number } {
  const type = err instanceof Error && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(err.name) ? err.name : "Error";
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status: unknown }).status) : 0;
  return { type, status: Number.isInteger(status) && status > 0 ? status : 0 };
}

function keep(list: object[], item: object): void {
  if (dead) return;
  list.push(item);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  if (!timer && endpoints) timer = setTimeout(() => flushTraces(), FLUSH_MS);
}

function attrsOf(action: string, extra: Readonly<Record<string, string>>): Attr[] {
  return [text("figchat.session", sessionId), text("figchat.action", action), ...Object.entries(extra).map(([k, v]) => text(k, v))];
}

export function logEvent(severity: "WARN" | "ERROR", body: string, extra: Readonly<Record<string, string>> = {}, action?: Action): void {
  if (!endpoints) return;
  keep(logs, {
    timeUnixNano: nanos(),
    severityNumber: severity === "ERROR" ? 17 : 13,
    severityText: severity,
    body: { stringValue: body },
    attributes: [text("figchat.session", sessionId), ...Object.entries(extra).map(([k, v]) => text(k, v))],
    ...(action ? { traceId: action.traceId, spanId: action.spanId } : {}),
  });
}

export function beginAction(name: ActionName, extra: Readonly<Record<string, string>> = {}): Action {
  const traceId = hex(16);
  const spanId = hex(8);
  const startTimeUnixNano = nanos();
  let over = false;
  const cap = setTimeout(() => action.end(new Error("timeout")), ACTION_CAP_MS);
  const action: Action = {
    name,
    traceId,
    spanId,
    traceparent: "00-" + traceId + "-" + spanId + "-01",
    end(failure) {
      if (over) return;
      over = true;
      clearTimeout(cap);
      if (last && last.action === action) last.endedAt = Date.now();
      const attributes = attrsOf(name, extra);
      let status: object = { code: 1 };
      if (failure !== undefined) {
        const bad = failureKind(failure);
        attributes.push(text("error.type", bad.type));
        if (bad.status) attributes.push(whole("http.response.status_code", bad.status));
        status = { code: 2, message: bad.type };
        logEvent("ERROR", name + " failed", { "error.type": bad.type, ...(bad.status ? { "http.response.status_code": String(bad.status) } : {}) }, action);
      }
      if (endpoints) keep(spans, { traceId, spanId, name, kind: 1, startTimeUnixNano, endTimeUnixNano: nanos(), attributes, status });
    },
  };
  last = { action, endedAt: 0 };
  return action;
}

export async function traced<T>(name: ActionName, extra: Readonly<Record<string, string>>, run: (action: Action) => Promise<T>): Promise<T> {
  const action = beginAction(name, extra);
  try {
    const out = await run(action);
    action.end();
    return out;
  } catch (err) {
    action.end(err);
    throw err;
  }
}

export function latestAction(): Action | null {
  if (!last) return null;
  return last.endedAt === 0 || Date.now() - last.endedAt <= JOIN_WINDOW_MS ? last.action : null;
}

export function settleSpeak(failure?: unknown): void {
  const now = last?.endedAt === 0 ? last.action : null;
  if (now?.name === "speak") now.end(failure);
}

export function settleSpeakFor(state: string): void {
  if (state === "playing" || state === "live") settleSpeak();
  else if (state === "error" || state === "lost" || state === "expired") settleSpeak(new Error("PlaybackError"));
}

export function traceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const now = latestAction();
  return sessionHeaders(now ? { ...extra, traceparent: now.traceparent } : extra);
}

const TRACEPARENT_SHAPE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/;

function stamped(frame: string): string {
  if (!frame.includes('"figaro.qua"')) return frame;
  const now = latestAction();
  if (!now) return frame;
  try {
    const call = JSON.parse(frame) as { method?: unknown; params?: Record<string, unknown> };
    if (call.method !== "figaro.qua" || !call.params || typeof call.params !== "object") return frame;
    if (typeof call.params.traceparent === "string" && TRACEPARENT_SHAPE.test(call.params.traceparent)) return frame;
    call.params.traceparent = now.traceparent;
    return JSON.stringify(call);
  } catch {
    return frame;
  }
}

export function traceDial(dial: Dial): Dial {
  return async (events) => {
    const socket = await dial(events);
    return { send: (frame) => socket.send(stamped(frame)), close: () => socket.close() };
  };
}

const resource = { attributes: [text("service.name", SERVICE_NAME)] };
const scope = { name: "zanni-react" };

function failed(status: number): void {
  if (!warned) {
    warned = true;
    console.warn("figaro web: trace batch dropped" + (status ? " (" + status + ")" : ""));
  }
  if (status === 401 || status === 403 || status === 404 || status === 405) dead = true;
}

function post(url: string, payload: object, unloading: boolean): void {
  const body = JSON.stringify(payload);
  if (unloading && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
  globalThis
    .fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      keepalive: body.length < 60000,
      headers: sessionHeaders({ "Content-Type": "application/json" }),
      body,
    })
    .then(
      (res) => {
        if (!res.ok) failed(res.status);
      },
      () => failed(0),
    );
}

export function flushTraces(unloading = false): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const mine = endpoints;
  const out = { spans, logs };
  spans = [];
  logs = [];
  if (!mine || dead) return;
  for (let i = 0; i < out.spans.length; i += BATCH) {
    post(mine.traces, { resourceSpans: [{ resource, scopeSpans: [{ scope, spans: out.spans.slice(i, i + BATCH) }] }] }, unloading);
  }
  for (let i = 0; i < out.logs.length; i += BATCH) {
    post(mine.logs, { resourceLogs: [{ resource, scopeLogs: [{ scope, logRecords: out.logs.slice(i, i + BATCH) }] }] }, unloading);
  }
}

function hook(): void {
  if (hooked) return;
  hooked = true;
  window.addEventListener("pagehide", () => flushTraces(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTraces(true);
  });
  window.addEventListener("error", (e) => logEvent("ERROR", "uncaught error", { "error.type": failureKind(e.error).type }));
  window.addEventListener("unhandledrejection", (e) => logEvent("ERROR", "unhandled rejection", { "error.type": failureKind(e.reason).type }));
}

export function configureTraces(base: string | null): void {
  spans = [];
  logs = [];
  dead = false;
  warned = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!base) {
    endpoints = null;
    return;
  }
  const root = base.replace(/\/$/, "");
  endpoints = { traces: new URL(root + "/v1/traces", document.baseURI).href, logs: new URL(root + "/v1/logs", document.baseURI).href };
  hook();
}
