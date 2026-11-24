import { atom, type PrimitiveAtom } from "jotai";
import { boundFormWriterOf } from "figaro-forms/aria";
import { boundFormAtom } from "figaro-forms/aria/jotai";
import { pagerWebCommand, webCommands, type WebCommandChoice } from "figaro-forms/catalog";
import { forkSpecOf, keysOf, pathOf, planOf, refusalOf, shown, type Plan, type Sources } from "../lib/command";
import { parseDraft, pathProblem, refusalLine } from "../lib/form-edit";
import type { PitView } from "../lib/pit-rows";
import { forkAtom, interruptAtom, type Done } from "./composer";
import { mintFigaroAtom, rootsAtom } from "./new-figaro";
import { traced } from "../../trace";
import { attendedFactsAtom, treeStateAtom } from "./pit";
import { attendedAtom, clientAtom, goAtom, storeNameAtom } from "./route";
import type { TreeNode } from "figaro-forms/aria";

export interface CommandState {
  readonly on: boolean;
  readonly line: string;
  readonly why: string;
  readonly shut: boolean;
}

export const COMMAND_OFF: CommandState = { on: false, line: "", why: "", shut: false };
const off = COMMAND_OFF;
const modes = new Map<string, PrimitiveAtom<CommandState>>();

export function commandAtom(key: string): PrimitiveAtom<CommandState> {
  let a = modes.get(key);
  if (!a) {
    a = atom(off);
    modes.set(key, a);
  }
  return a;
}

export const helpOpenAtom = atom(false);

export type Outcome = Done & { readonly open?: PitView | "help" };

const fail = (why: string): Outcome => ({ ok: false, why });
const ok = (done: string, open?: PitView | "help"): Outcome => ({ ok: true, done, ...(open ? { open } : {}) });

export const commandSourcesAtom = atom((get): Sources => {
  const tree = get(treeStateAtom);
  const at = get(attendedAtom);
  const arias = tree ? [...tree.nodes.values()].map((n) => ({ id: n.id, label: n.mantra || n.handle || n.label })) : [];
  const bound = at ? get(boundFormAtom(at.client, at.aria)) : undefined;
  return { arias, keys: keysOf(bound?.root, false), outfits: get(outfitsAtom) };
});

export const outfitsAtom = atom<readonly string[]>([]);

export const loadOutfitsAtom = atom(null, async (get, set) => {
  const client = get(clientAtom);
  if (!client || get(outfitsAtom).length) return;
  try {
    const reply = await client.connection.call<{ names?: string[]; outfits?: { name: string }[] }>("angelus.outfits", {});
    set(outfitsAtom, reply.outfits?.map((o) => o.name) ?? reply.names ?? []);
  } catch {
    return;
  }
});

function resolveAria(spec: string, nodes: readonly TreeNode[]): { id: string } | { why: string } {
  const exact = nodes.find((n) => n.id === spec);
  if (exact) return { id: exact.id };
  const byId = nodes.filter((n) => n.id.startsWith(spec));
  if (byId.length === 1) return { id: byId[0]!.id };
  if (byId.length > 1) return { why: spec + " matches " + byId.length + " arias; type more of the id" };
  const low = spec.toLowerCase();
  const named = nodes.filter((n) => (n.handle ?? "").toLowerCase() === low || (n.mantra ?? "").toLowerCase() === low || n.label.toLowerCase() === low);
  if (named.length === 1) return { id: named[0]!.id };
  if (named.length > 1) return { why: spec + " names " + named.length + " arias; use the id" };
  if (/^[0-9a-f]{32}$/.test(spec)) return { id: spec };
  return { why: "no aria matches " + spec };
}

export const runCommandAtom = atom(null, async (get, set, line: string): Promise<Outcome> => {
  const plan: Plan = planOf(line);
  if (plan.kind === "none") return fail("Type a command. :help lists them.");
  if (plan.kind === "refused") return fail(plan.why);
  const { doc, args, flags, prompt } = plan;
  const at = get(attendedAtom);
  const client = get(clientAtom);
  const store = get(storeNameAtom);
  if (!client) return fail(doc.name + ": no store is open.");
  const route = webCommands[doc.name];
  const nodes = [...(get(treeStateAtom)?.nodes.values() ?? [])];
  const target = (spec: string | undefined): { id: string } | { why: string } => {
    const want = spec ?? flags.id;
    if (want) return resolveAria(want, nodes);
    return at ? { id: at.aria } : { why: doc.name + ": no aria is open" };
  };
  const needTarget = (spec: string | undefined): string | Outcome => {
    const got = target(spec);
    return "id" in got ? got.id : fail(doc.name + ": " + got.why + ".");
  };
  const formOf = (id: string) => get(boundFormAtom(client, id));

  const write = async (kind: "set" | "unset" | "toggle", keyArgs: string[]): Promise<Outcome> => {
    const id = needTarget(undefined);
    if (typeof id !== "string") return id;
    const writer = boundFormWriterOf(client, id);
    const keys = kind === "unset" ? keyArgs : [keyArgs[0]!];
    for (const key of keys) {
      const bad = pathProblem(key);
      if (bad) return fail(kind + ": " + bad);
    }
    const root = formOf(id).root;
    try {
      if (kind === "unset") {
        for (const key of keys) {
          const r = await writer.unset(key);
          if (!r.ok) return fail(refusalLine(key, r.refusal));
        }
        return ok("Unset " + keys.join(", ") + ".");
      }
      const key = keys[0]!;
      const was = pathOf(root, key);
      if (kind === "toggle") {
        if (was.found && typeof was.value !== "boolean") return fail("toggle: " + key + " is not true or false.");
        const next = was.found ? !was.value : true;
        const r = await writer.set(key, next as never);
        return r.ok ? ok(key + " is " + next + ".") : fail(refusalLine(key, r.refusal));
      }
      const r = await writer.set(key, parseDraft(keyArgs.slice(1).join(" ")) as never);
      return r.ok ? ok("Set " + key + ".") : fail(refusalLine(key, r.refusal));
    } catch (err) {
      return fail(kind + ": " + (err instanceof Error ? err.message : String(err)));
    }
  };

  switch (doc.name) {
    case "help": {
      if (!args[0]) return ok("", "help");
      const word = pagerWebCommand(args[0]);
      if (!word) return fail(args[0] + ": no such command.");
      const why = refusalOf(word);
      return ok((word.usage ?? word.name) + "  " + word.help + (why ? "  Not here: " + why : ""));
    }
    case "outfits":
      return ok("", "outfits");
    case "list":
    case "lsh":
    case "troupe":
      return ok("", "tree");
    case "recent":
      return ok("", "recent");
    case "attend":
    case "listen":
    case "show": {
      const spec = args[0];
      if (!spec) return at ? ok("Already here.") : fail(doc.name + ": name an aria.");
      const colon = spec.indexOf(":");
      const base = colon < 0 ? spec : spec.slice(0, colon);
      const turn = colon < 0 ? undefined : /^\d{1,6}$/.test(spec.slice(colon + 1)) ? Number(spec.slice(colon + 1)) : NaN;
      if (Number.isNaN(turn)) return fail(doc.name + ": " + spec + " is not <id>[:<turn>].");
      const got = base ? resolveAria(base, nodes) : at ? { id: at.aria } : { why: "no aria is open" };
      if ("why" in got) return fail(doc.name + ": " + got.why + ".");
      set(goAtom, { store, aria: got.id, ...(turn ? { turn } : {}) });
      return ok("Showing " + got.id.slice(0, 8) + ".");
    }
    case "send": {
      if (!prompt) return fail("send: the text follows --. " + (doc.usage ?? ""));
      const id = needTarget(args[0]);
      if (typeof id !== "string") return id;
      try {
        await traced("send", { "figaro.aria": id }, () => client.peek(id).qua(prompt));
        return ok("Sent.");
      } catch (err) {
        return fail("Not sent: " + (err instanceof Error ? err.message : "network"));
      }
    }
    case "new": {
      const root = get(rootsAtom)[0]?.id ?? "";
      return set(mintFigaroAtom, { root, outfits: flags.outfit ?? "", text: prompt ?? "" });
    }
    case "fork": {
      const spec = forkSpecOf(args[0]);
      if (typeof spec === "string") return fail(spec);
      let aria: string | undefined;
      if (spec.aria) {
        const got = resolveAria(spec.aria, nodes);
        if ("why" in got) return fail("fork: " + got.why + ".");
        aria = got.id;
      } else if (flags.id) {
        const got = resolveAria(flags.id, nodes);
        if ("why" in got) return fail("fork: " + got.why + ".");
        aria = got.id;
      }
      return set(forkAtom, { turn: spec.turn ?? 0, ...(prompt ? { text: prompt } : {}), ...(aria ? { aria } : {}), ...(flags.stay ? { stay: true } : {}) });
    }
    case "hup": {
      const id = needTarget(args[0]);
      if (typeof id !== "string") return id;
      if (id === at?.aria) {
        await set(interruptAtom, "keep");
        return ok("Interrupted.");
      }
      try {
        await client.peek(id).interrupt({ queue: "keep" });
        return ok("Interrupted.");
      } catch (err) {
        return fail("Not stopped: " + (err instanceof Error ? err.message : "network"));
      }
    }
    case "set":
    case "unset":
    case "toggle":
      return write(doc.name, args);
    case "get": {
      const id = needTarget(undefined);
      if (typeof id !== "string") return id;
      const root = formOf(id).root;
      const out: string[] = [];
      for (const key of args) {
        const got = pathOf(root, key);
        if (!got.found) return fail("get: " + key + " is not set.");
        out.push(args.length > 1 ? key + ": " + shown(got.value) : shown(got.value));
      }
      return ok(out.join("  "));
    }
    case "pwd": {
      const id = needTarget(undefined);
      if (typeof id !== "string") return id;
      const got = pathOf(formOf(id).root, "system.cwd");
      return got.found && got.value ? ok(shown(got.value)) : fail("pwd: system.cwd is unset.");
    }
    case "name":
    case "status": {
      const id = needTarget(args[0]);
      if (typeof id !== "string") return id;
      const node = get(treeStateAtom)?.nodes.get(id);
      const own = id === at?.aria ? get(attendedFactsAtom) : undefined;
      const label = node?.mantra || node?.handle || own?.mantra || id.slice(0, 8);
      return ok(doc.name === "name" ? label : label + ": " + (node?.state ?? "unknown") + (node?.cwd ? "  " + node.cwd : ""));
    }
    case "state": {
      const sub = args[0];
      if (!sub || sub === "show" || sub === "ls") {
        if (!sub && flags.id) return fail("state: --id shows another aria's form on the pager; here :state shows this one.");
        return ok("", "state");
      }
      if (sub === "set" || sub === "delete" || sub === "unset") {
        const rest = sub === "set" ? args.slice(1) : args.slice(1).flatMap((a) => a.split(",")).filter(Boolean);
        if (sub === "set" ? rest.length !== 2 : rest.length === 0) return fail("usage: " + (doc.usage ?? "state"));
        return write(sub === "set" ? "set" : "unset", rest);
      }
      const named = doc.choices?.find((c: WebCommandChoice) => c.name === sub);
      return fail("state " + sub + ": " + (named ? "not available in figaro web" : "no such subcommand") + (route.on === "gateway" && route.limits ? " (" + route.limits + ")" : "") + ".");
    }
    default:
      return fail(doc.name + ": figaro web does not run it yet.");
  }
});
