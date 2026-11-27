import type { TreeNode } from "figaro-forms/aria";
import { describe, expect, it } from "vitest";
import { atlasOf, canonOf, charterRoleOf, drawnAncestors, overridesOf, pickCentral, queueFormOf, standing, topologyOf, type CharterRole, type QueueForm, type Seat } from "../src/order/charter";

const seatsOf = (seat: Seat | undefined): Seat[] => (seat ? [seat, ...seat.children.flatMap(seatsOf)] : []);

const node = (o: Partial<TreeNode> & { id: string }): TreeNode => ({ kind: "aria", label: o.id, roleName: undefined, target: undefined, handle: undefined, mantra: undefined, parent: undefined, children: [], daemon: "d", state: "idle", status: "live", roles: [], cwd: undefined, activeAt: undefined, ctx: undefined, ctxLimit: undefined, reapsAt: undefined, bound: false, ...o });

const nodes = (...list: TreeNode[]): ReadonlyMap<string, TreeNode> => new Map(list.map((n) => [n.id, n]));

const A = (n: string): string => n.repeat(32).slice(0, 32);
const canon = canonOf([]);

const role = (id: string, name: string, target: string, chartered: Record<string, unknown>, more: Record<string, unknown> = {}): CharterRole => {
  const made = charterRoleOf(id, name, "", { "role-name": name, "target-aria": target, chartered, ...more } as never, canon);
  if (!made) throw new Error("not chartered");
  return made;
};

const crown = role("@c0de0001", "Crown", A("1"), { seat: "king", root: "@c0de0001", "central-command": true });
const knight = role("@c0de0002", "Knight", A("2"), { seat: "knight", regiment: "frontend", root: "@c0de0001", "reports-to": "@c0de0001" });
const lead = role("@c0de0003", "Lead", A("3"), { seat: "lead", regiment: "frontend", root: "@c0de0001", "reports-to": "@c0de0002" });

describe("reading a role form", () => {
  it("is chartered only when it carries a chartered object", () => {
    expect(charterRoleOf("@r1", "R", "", { name: "R", queue: {} }, canon)).toBeUndefined();
    expect(charterRoleOf("@r1", "R", "", { chartered: "yes" }, canon)).toBeUndefined();
    expect(charterRoleOf("@r1", "R", "", { chartered: {} }, canon)?.chartered.seat).toBe("");
  });

  it("reads seat, regiment, reports-to, root, succession and the reviewer limit", () => {
    const r = role("@r1", "R", A("a"), { seat: "inspector", regiment: "figaro", "reports-to": "@c0de0001", root: "@c0de0001", "succession-abdication": "retire", "succession-ttl": "5m", "reviewer-max-children": 2 });
    expect(r.chartered).toEqual({ seat: "inspector", regiment: "figaro", reportsTo: "@c0de0001", root: "@c0de0001", central: false, abdication: "retire", ttl: "5m", reviewerMaxChildren: 2, studies: [] });
    expect(crown.chartered.central).toBe(true);
  });

  it("reads the fan-out limits, whichever are present, and the queue contract", () => {
    const r = role("@r1", "R", A("a"), { seat: "knight" }, { system: { fanout: { min_children: 1, max_children: 3, quota: 6 } }, "queue-contract": { version: "v0", contract: "https://c.example.invalid/x", kinds: ["work", 4], priority: true } });
    expect(r.fanout).toEqual({ min: 1, max: 3, quota: 6 });
    expect(r.contract).toEqual({ version: "v0", contract: "https://c.example.invalid/x", kinds: ["work"], priority: true });
    expect(role("@r2", "R", A("a"), { seat: "king" }).fanout).toEqual({ min: undefined, max: undefined, quota: undefined });
    expect(role("@r2", "R", A("a"), { seat: "king" }).contract).toBeUndefined();
  });

  it("reads the queue forms a role studies, as form ids", () => {
    const r = role("@r1", "R", A("a"), { seat: "king", studies: ["@c0de0103", "c0de0104", 7] });
    expect(r.chartered.studies).toEqual(["@c0de0103", "@c0de0104"]);
  });

  it("takes the holder from target-aria, else the roster", () => {
    expect(charterRoleOf("@r1", "R", "roster-target", { chartered: {} }, canon)?.target).toBe("roster-target");
    expect(charterRoleOf("@r1", "R", "roster-target", { "target-aria": "own-target", chartered: {} }, canon)?.target).toBe("own-target");
  });

  it("resolves a short form id to the long id the daemon lists", () => {
    const c = canonOf(["@c0de0001c0de0001c0de0001c0de0001", "7a4409668d09b3eb675a1dbf852ed40a"]);
    expect(c("@c0de0001")).toBe("c0de0001c0de0001c0de0001c0de0001");
    expect(c("7a440966")).toBe("7a4409668d09b3eb675a1dbf852ed40a");
    expect(c("@zzzzzzzz")).toBe("zzzzzzzz");
    expect(c("c0de")).toBe("c0de");
    const twice = canonOf(["abcdef01aaaa", "abcdef01bbbb"]);
    expect(twice("abcdef01")).toBe("abcdef01");
  });
});

const queueForm = (id: string, name: string, under: string, root = "@c0de0001", more: Record<string, unknown> = {}): QueueForm => {
  const made = queueFormOf(id, name, { name, chartered: { kind: "queue-form", root, under }, ...more } as never, canon);
  if (!made) throw new Error("not a queue form");
  return made;
};

describe("reading a queue form", () => {
  it("is a queue form only when chartered.kind says so, and never a role", () => {
    const form = { name: "Handoff", "queue-contract": { version: "v0", kinds: ["handoff"], priority: false }, chartered: { kind: "queue-form", root: "@c0de0001", under: "@c0de0002" } };
    expect(queueFormOf("@c0de0101", "Handoff", form as never, canon)).toEqual({ id: "@c0de0101", name: "Handoff", root: "@c0de0001", under: "@c0de0002", contract: { version: "v0", contract: "", kinds: ["handoff"], priority: false } });
    expect(charterRoleOf("@c0de0101", "Handoff", "", form as never, canon)).toBeUndefined();
    expect(queueFormOf("@r1", "R", { chartered: { seat: "king" } } as never, canon)).toBeUndefined();
    expect(queueFormOf("@r1", "R", { name: "R" } as never, canon)).toBeUndefined();
  });
});

describe("the drawn tree", () => {
  const base = nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") }), node({ id: A("3"), parent: A("2") }), node({ id: A("4"), parent: A("1") }));

  it("takes each aria's parent from the fork nesting", () => {
    const atlas = atlasOf(base, new Map(), canon);
    expect(atlas.parent.get(A("3"))).toBe(A("2"));
    expect(drawnAncestors(atlas, A("3"))).toEqual([A("2"), A("1")]);
    expect(atlas.children.get(A("1"))).toEqual([A("2"), A("4")]);
  });

  it("lets a @topology entry override the fork parent, or draw an aria at the top", () => {
    const moved = atlasOf(base, overridesOf({ [A("3")]: A("4"), [A("2")]: "" }, canon), canon);
    expect(drawnAncestors(moved, A("3"))).toEqual([A("4"), A("1")]);
    expect(drawnAncestors(moved, A("2"))).toEqual([]);
    expect(moved.children.get(A("1"))).toEqual([A("4")]);
    expect(moved.children.get("")).toEqual([A("1"), A("2")]);
  });

  it("ignores an entry that is not a string, and an entry for an aria the caller cannot see", () => {
    const overrides = overridesOf({ [A("3")]: 4, [A("9")]: A("1") } as never, canon);
    expect([...overrides.keys()]).toEqual([A("9")]);
    expect(atlasOf(base, overrides, canon).nodes.has(A("9"))).toBe(false);
  });

  it("stops at a cycle", () => {
    const loop = atlasOf(nodes(node({ id: A("1"), parent: A("2") }), node({ id: A("2"), parent: A("1") })), new Map(), canon);
    expect(drawnAncestors(loop, A("1"))).toEqual([A("2")]);
  });

  it("counts live arias only as drawn children, never role forms or retired arias", () => {
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") }), node({ id: A("3"), parent: A("1"), status: "retired" }), node({ id: "@f", kind: "role", parent: A("1") })), new Map(), canon);
    expect(atlas.children.get(A("1"))).toEqual([A("2")]);
  });
});

describe("the chartered topology", () => {
  const roles = [crown, knight, lead];

  it("hangs chartered holders from the drawn tree, nearest chartered ancestor first", () => {
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") }), node({ id: A("3"), parent: A("2") })), new Map(), canon);
    const t = topologyOf(crown, roles, [], atlas);
    expect(seatsOf(t.tree).map((s) => s.roles[0]!.role.name)).toEqual(["Crown", "Knight", "Lead"]);
    expect(t.tree!.children[0]!.children[0]!.skipped).toBe(0);
    expect(t.apart).toEqual([]);
    expect(t.vacant).toEqual([]);
  });

  it("collapses unchartered arias between two chartered ones and says how many", () => {
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") }), node({ id: A("7"), parent: A("2") }), node({ id: A("8"), parent: A("7") }), node({ id: A("3"), parent: A("8") })), new Map(), canon);
    const seats = seatsOf(topologyOf(crown, roles, [], atlas).tree);
    expect(seats.map((s) => s.aria)).toEqual([A("1"), A("2"), A("3")]);
    expect(seats[2]!.skipped).toBe(2);
    expect(seats[2]!.drawnChildren).toBe(0);
    expect(seats[1]!.drawnChildren).toBe(1);
  });

  it("does not count a role form row as a skipped aria", () => {
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") }), node({ id: "@form", kind: "role", parent: A("2") }), node({ id: A("3"), parent: "@form" })), new Map(), canon);
    expect(seatsOf(topologyOf(crown, roles, [], atlas).tree)[2]!.skipped).toBe(0);
  });

  it("follows an override: the same arias hang differently with and without it", () => {
    const forks = nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") }), node({ id: A("3") }), node({ id: A("7"), parent: A("2") }));
    const without = topologyOf(crown, roles, [], atlasOf(forks, new Map(), canon));
    expect(without.tree!.children.map((s) => s.aria)).toEqual([A("2")]);
    expect(without.apart.map((s) => s.aria)).toEqual([A("3")]);
    const withOverride = topologyOf(crown, roles, [], atlasOf(forks, overridesOf({ [A("3")]: A("7") }, canon), canon));
    const seats = seatsOf(withOverride.tree);
    expect(seats.map((s) => s.aria)).toEqual([A("1"), A("2"), A("3")]);
    expect(seats[2]!.skipped).toBe(1);
    expect(withOverride.apart).toEqual([]);
  });

  it("flags a mismatch only where the declared reports-to differs from the drawn parent", () => {
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") }), node({ id: A("3"), parent: A("1") })), new Map(), canon);
    const seats = seatsOf(topologyOf(crown, roles, [], atlas).tree);
    const byName = Object.fromEntries(seats.map((s) => [s.roles[0]!.role.name, s.roles[0]!.mismatch]));
    expect(byName.Crown).toBeUndefined();
    expect(byName.Knight).toBeUndefined();
    expect(byName.Lead).toEqual({ declared: "@c0de0002", declaredName: "Knight", drawnUnder: ["Crown"] });
  });

  it("names a declared parent it cannot read by its short id, and flags a seat drawn at the top", () => {
    const stray = role("@c0de0009", "Stray", A("5"), { seat: "lead", root: "@c0de0001", "reports-to": "@abcdef0123456789" });
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("5") })), new Map(), canon);
    const t = topologyOf(crown, [crown, stray], [], atlas);
    expect(t.apart.map((s) => s.aria)).toEqual([A("5")]);
    expect(t.apart[0]!.roles[0]!.mismatch).toEqual({ declared: "@abcdef0123456789", declaredName: "abcdef01", drawnUnder: [] });
  });

  it("shows only roles chartered under this central command", () => {
    const rival = role("@c0de0099", "Rival", A("9"), { seat: "king", root: "@c0de0099", "central-command": true });
    const scribe = role("@c0de0098", "Scribe", A("8"), { seat: "lead", root: "@c0de0099" });
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("9") }), node({ id: A("8"), parent: A("9") })), new Map(), canon);
    const mine = topologyOf(crown, [crown, rival, scribe], [], atlas);
    expect(seatsOf(mine.tree).map((s) => s.roles[0]!.role.name)).toEqual(["Crown"]);
    const theirs = topologyOf(rival, [crown, rival, scribe], [], atlas);
    expect(seatsOf(theirs.tree).map((s) => s.roles[0]!.role.name)).toEqual(["Rival", "Scribe"]);
  });

  it("lists a role without a live holder as vacant, not in the tree", () => {
    const vacant = role("@c0de0004", "Empty", "", { seat: "lead", root: "@c0de0001" });
    const gone = role("@c0de0005", "Gone", A("6"), { seat: "lead", root: "@c0de0001" });
    const retired = role("@c0de0006", "Retired", A("7"), { seat: "lead", root: "@c0de0001" });
    const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("7"), status: "retired" })), new Map(), canon);
    const t = topologyOf(crown, [crown, vacant, gone, retired], [], atlas);
    expect(t.vacant.map((v) => v.role.name)).toEqual(["Empty", "Gone", "Retired"]);
    expect(seatsOf(t.tree).length).toBe(1);
  });

  it("puts two roles one aria holds on one seat, and does not flag a report to the other", () => {
    const second = role("@c0de0007", "Second", A("1"), { seat: "lead", root: "@c0de0001", "reports-to": "@c0de0001" });
    const t = topologyOf(crown, [crown, second], [], atlasOf(nodes(node({ id: A("1") })), new Map(), canon));
    expect(t.tree!.roles.map((r) => r.role.name)).toEqual(["Crown", "Second"]);
    expect(t.tree!.roles.map((r) => r.mismatch)).toEqual([undefined, undefined]);
  });

  it("has no tree when the central command is vacant, and still lists what is drawn", () => {
    const atlas = atlasOf(nodes(node({ id: A("2") })), new Map(), canon);
    const t = topologyOf({ ...crown, target: "" }, [{ ...crown, target: "" }, knight], [], atlas);
    expect(t.tree).toBeUndefined();
    expect(t.apart.map((s) => s.roles[0]!.role.name)).toEqual(["Knight"]);
    expect(t.vacant.map((v) => v.role.name)).toEqual(["Crown"]);
  });

  it("orders siblings by seat, then regiment, then name", () => {
    const edge = role("@c0de0010", "Edge", A("4"), { seat: "edge", root: "@c0de0001", "reports-to": "@c0de0001" });
    const aardvark = role("@c0de0011", "Aardvark Lead", A("5"), { seat: "lead", root: "@c0de0001", "reports-to": "@c0de0001" });
    const backKnight = role("@c0de0012", "Back Knight", A("6"), { seat: "knight", regiment: "backend", root: "@c0de0001", "reports-to": "@c0de0001" });
    const atlas = atlasOf(nodes(node({ id: A("1") }), ...["2", "4", "5", "6"].map((n) => node({ id: A(n), parent: A("1") }))), new Map(), canon);
    const t = topologyOf(crown, [crown, aardvark, edge, knight, backKnight], [], atlas);
    expect(t.tree!.children.map((s) => s.roles[0]!.role.name)).toEqual(["Back Knight", "Knight", "Aardvark Lead", "Edge"]);
  });
});

describe("queue forms in the topology", () => {
  const atlas = atlasOf(nodes(node({ id: A("1") }), node({ id: A("2"), parent: A("1") })), new Map(), canon);
  const crownStudies = role("@c0de0001", "Crown", A("1"), { seat: "king", root: "@c0de0001", "central-command": true, studies: ["@c0de0103", "@c0de0fff"] });

  it("hangs each queue form under the role it is drawn under, by name", () => {
    const handoff = queueForm("@c0de0102", "Handoff", "@c0de0002");
    const board = queueForm("@c0de0101", "Board", "@c0de0002");
    const t = topologyOf(crown, [crown, knight, lead], [handoff, board], atlas);
    expect(t.tree!.children[0]!.roles[0]!.queues.map((q) => q.name)).toEqual(["Board", "Handoff"]);
    expect(t.tree!.roles[0]!.queues).toEqual([]);
    expect(t.strays).toEqual([]);
  });

  it("puts a queue form under a vacant role with that role, and one under an unminted role among the strays", () => {
    const empty = role("@c0de0004", "Empty", "", { seat: "lead", root: "@c0de0001" });
    const under = queueForm("@c0de0103", "Under empty", "@c0de0004");
    const lost = queueForm("@c0de0104", "Lost", "@c0de0008");
    const t = topologyOf(crown, [crown, empty], [under, lost], atlas);
    expect(t.vacant[0]!.queues.map((q) => q.name)).toEqual(["Under empty"]);
    expect(t.strays.map((q) => q.name)).toEqual(["Lost"]);
  });

  it("leaves out a queue form chartered to another central command", () => {
    const t = topologyOf(crown, [crown], [queueForm("@c0de0105", "Theirs", "@c0de0001", "@c0de0099")], atlas);
    expect(t.tree!.roles[0]!.queues).toEqual([]);
    expect(t.strays).toEqual([]);
  });

  it("names the queue forms a role studies, and says which it cannot find", () => {
    const review = queueForm("@c0de0103", "Review", "@c0de0008");
    const t = topologyOf(crownStudies, [crownStudies], [review], atlas);
    expect(t.tree!.roles[0]!.studies).toEqual([
      { id: "@c0de0103", name: "Review", found: true },
      { id: "@c0de0fff", name: "c0de0fff", found: false },
    ]);
  });
});

describe("choosing the central command", () => {
  it("takes the central command that most roles name as their root", () => {
    const rival = role("@c0de0099", "Rival", A("9"), { seat: "king", root: "@c0de0099", "central-command": true });
    expect(pickCentral([rival, crown, knight, lead])?.name).toBe("Crown");
    expect(pickCentral([knight, lead])).toBeUndefined();
  });
});

describe("a seat's fan-out against its limits", () => {
  it("is over above max and short below min, and never flagged without a limit", () => {
    const fan = { min: 1, max: 2, quota: undefined };
    expect([0, 1, 2, 3].map((n) => standing(fan, n))).toEqual(["short", "within", "within", "over"]);
    expect(standing({ min: undefined, max: undefined, quota: undefined }, 9)).toBe("within");
  });
});
