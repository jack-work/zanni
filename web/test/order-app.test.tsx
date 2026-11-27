import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { AriaClient } from "figaro-forms/aria";
import { App } from "../src/order/app";
import { orderClientAtom } from "../src/order/state";
import { mock } from "./mock";

type Role = { id: string; name: string; form: { queue?: Record<string, Record<string, unknown>> } & Record<string, unknown> };
const fixture = JSON.parse(readFileSync("test/fixtures/order-queues.json", "utf8")) as { roles: Role[]; topology: Record<string, string> };
const ariasGlobal = JSON.parse(readFileSync("test/fixtures/arias-global.json", "utf8")) as Record<string, unknown>;
const byName = (name: string): Role => fixture.roles.find((r) => r.name === name)!;
const widgetWork = byName("Widget Work");
const aria = (hex: string): string => ("c0ffee" + hex).repeat(4);
const CROWN = "@c0de0001c0de0001c0de0001c0de0001";
const hash = (...parts: string[]): string => "#/" + parts.map(encodeURIComponent).join("/");

function mount(o: { roles?: Role[]; topology?: Record<string, string>; global?: object | null; listed?: string[] } = {}) {
  const core = (mock as unknown as { create(o: object): any }).create({ step: 1, roles: o.roles ?? fixture.roles, topology: o.topology ?? fixture.topology, global: o.global === undefined ? ariasGlobal : o.global, listed: o.listed ?? [CROWN] });
  const client = new AriaClient({ dial: core.dial, pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40 });
  const store = createStore();
  store.set(orderClientAtom, client);
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  return core;
}

const nodes = (kind?: string): string[] => [...document.querySelectorAll(kind ? `[data-node][data-kind=${kind}]` : "[data-node]")].map((n) => n.querySelector(".og-label")!.textContent ?? "");
const node = (id: string): SVGGElement => document.querySelector<SVGGElement>(`[data-node="${id}"]`)!;
const nodeNamed = (label: string, kind: string): SVGGElement => [...document.querySelectorAll<SVGGElement>(`[data-node][data-kind=${kind}]`)].find((n) => n.querySelector(".og-label")!.textContent === label)!;
const edges = (kind: string): string[] => [...document.querySelectorAll(`[data-edge=${kind}]`)].map((e) => (e.getAttribute("data-from") ?? "") + ">" + (e.getAttribute("data-to") ?? ""));
const detail = (): HTMLElement => document.querySelector<HTMLElement>('[data-field="detail"]')!;
const field = (name: string, within: ParentNode = detail()): HTMLElement | null => within.querySelector(`[data-field=${name}]`);
const fact = (name: string, within: ParentNode = detail()): string | null => field(name, within)?.querySelector("dd")?.textContent ?? null;
const shown = async (): Promise<void> => void (await waitFor(() => expect(document.querySelectorAll("[data-node]").length).toBeGreaterThan(15), { timeout: 3000 }));
const open = async (label: string, kind = "role"): Promise<HTMLElement> => {
  if (nodeNamed(label, kind).getAttribute("aria-pressed") !== "true") fireEvent.click(nodeNamed(label, kind));
  await waitFor(() => expect(detail()?.querySelector(".og-title")?.textContent).toBe(label));
  return detail();
};

afterEach(() => {
  window.location.hash = "";
});

describe("the order page: the graph", () => {
  it("draws the chartered roles of one central command, and no card list", async () => {
    mount();
    await shown();
    expect(nodes("role").sort()).toEqual(["@Backend Lead", "@Bridge Knight", "@Crown", "@Edge Engineer", "@Frontier Knight", "@Frontier Strategist", "@Lost Lead", "@Widget Engineer"]);
    expect(document.querySelector(".ord-card, .ord-seats, .ord-role")).toBeNull();
    expect(document.querySelector('[data-field="graph"]')!.getAttribute("data-central")).toBe(CROWN);
  });

  it("carries the discovered central command in the address", async () => {
    mount();
    await shown();
    await waitFor(() => expect(window.location.hash).toBe(hash(CROWN)));
  });

  it("draws each aria under its nearest chartered ancestor in the drawn tree", async () => {
    mount();
    await shown();
    expect(edges("under").sort()).toEqual([aria("01") + ">" + aria("02"), aria("01") + ">" + aria("03"), aria("02") + ">" + aria("05"), aria("02") + ">" + aria("06"), aria("02") + ">forks:" + aria("02")].sort());
  });

  it("targets each role form at the aria that holds it, and shows vacant ones apart", async () => {
    mount();
    await shown();
    expect(edges("target")).toHaveLength(6);
    expect(edges("target")).toContain(CROWN + ">" + aria("01"));
    for (const vacant of ["@c0de0004", "@c0de0005"]) expect(node(vacant).classList.contains("og-tone-vacant")).toBe(true);
  });

  it("names the holder, the seat, the regiment and the fan-out against the drawn children", async () => {
    mount();
    await shown();
    let d = await open("@Frontier Knight");
    expect(fact("holder", d)!).toBe("held by Frontend Engineer / figchat web");
    expect(fact("seat", d)!).toBe("knight");
    expect(fact("regiment", d)!).toBe("frontend");
    expect(fact("fanout", d)!).toBe("2 children · min 1 · max 2 · quota 4");
    d = await open("@Frontier Strategist");
    expect(fact("fanout", d)!).toBe("0 children · max 1 · quota 3");
    d = await open("@Edge Engineer");
    expect(fact("fanout", d)!).toBe("0 children · max 1 · quota 1");
    d = await open("@Crown");
    expect(field("fanout", d)).toBeNull();
    expect(node(CROWN).classList.contains("og-tone-central")).toBe(true);
  });

  it("collapses the unchartered arias between two chartered seats and says so", async () => {
    mount();
    await shown();
    expect(fact("skipped", await open("@Widget Engineer"))!).toBe("skips 1 unchartered");
    expect(field("skipped", await open("@Frontier Strategist"))).toBeNull();
  });

  it("flags only the seats drawn somewhere other than where their charter reports", async () => {
    mount();
    await shown();
    expect(fact("mismatch", await open("@Widget Engineer"))!).toBe("drawn under Frontier Knight, charter says Frontier Strategist");
    expect(fact("mismatch", await open("@Bridge Knight"))!).toBe("drawn outside the command, charter says Crown");
    for (const n of ["@Crown", "@Frontier Knight", "@Frontier Strategist", "@Edge Engineer"]) expect(field("mismatch", await open(n)), n).toBeNull();
  });

  it("marks a seat with no live holder vacant, or its holder not visible", async () => {
    mount();
    await shown();
    expect(fact("holder", await open("@Backend Lead"))!).toBe("vacant");
    expect(fact("holder", await open("@Lost Lead"))!).toBe("holder not visible: c0ffeefe");
  });

  it("draws a queue form under an unminted seat on its own, naming the seat", async () => {
    mount();
    await shown();
    const review = nodeNamed("Review Queue", "queue");
    expect(review.classList.contains("og-tone-stray")).toBe(true);
    fireEvent.click(review);
    await waitFor(() => expect(field("under", detail())!.textContent).toBe("drawn under c0de0008"));
  });

  it("hides a role form without a chartered object, a seat of another command, and its queue forms", async () => {
    mount();
    await shown();
    for (const n of ["@Idle Scout", "@Stray Scribe", "@Rival Crown"]) expect(nodes("role")).not.toContain(n);
    expect(nodes("queue")).not.toContain("Rival Handoff");
  });

  it("shows the charter facts on a role", async () => {
    mount();
    await shown();
    const d = await open("@Widget Engineer");
    expect(fact("reports_to", d)!).toBe("Frontier Strategist (not where it is drawn)");
    expect(fact("succession", d)!).toBe("retire, ttl 5m");
  });

  it("names the holder and the forks on the aria node", async () => {
    mount();
    await shown();
    const d = await open("Frontier Knight", "aria");
    expect(fact("holder", d)!).toBe("Frontend Engineer / figchat web");
    expect(fact("roles", d)!).toBe("Frontier Knight");
    expect(fact("fanout", d)!).toBe("2 children · min 1 · max 2 · quota 4");
    expect(nodeNamed("forks", "group").querySelector(".og-sub")!.textContent).toBe("1 of max 2");
  });
});

describe("the order page: following the forms", () => {
  it("follows @topology: dropping the override moves the seat out from under its holder", async () => {
    const core = mount();
    await shown();
    expect(edges("under")).toContain(aria("02") + ">" + aria("05"));
    await act(async () => core.setTopology({}));
    await waitFor(() => expect(nodes().length > 15 && !edges("under").includes(aria("02") + ">" + aria("05"))).toBe(true), { timeout: 3000 });
    const d = await open("@Frontier Knight");
    expect(fact("fanout", d)!).toBe("1 child · min 1 · max 2 · quota 4");
    expect(fact("mismatch", await open("@Widget Engineer"))!).toBe("drawn outside the command, charter says Frontier Strategist");
    expect(field("skipped", detail())).toBeNull();
  });

  it("follows @topology: drawing a seat where its charter reports clears the flag", async () => {
    const core = mount();
    await shown();
    expect(field("mismatch", await open("@Widget Engineer"))).not.toBeNull();
    await act(async () => core.setTopology({ ...fixture.topology, [aria("05")]: aria("06") }));
    await waitFor(() => expect(edges("under")).toContain(aria("06") + ">" + aria("05")), { timeout: 3000 });
    await shown();
    expect(field("mismatch", await open("@Widget Engineer"))).toBeNull();
    expect(fact("fanout", await open("@Frontier Strategist"))!).toBe("1 child · max 1 · quota 3");
  });

  it("shows a fan-out over its maximum on the role and on the forks", async () => {
    const core = mount();
    await shown();
    await act(async () => core.setTopology({ ...fixture.topology, [aria("09")]: aria("02"), [aria("0b")]: aria("02") }));
    await waitFor(() => expect(nodeNamed("forks", "group").classList.contains("og-tone-over")).toBe(true), { timeout: 3000 });
    const d = await open("@Frontier Knight");
    expect(fact("fanout", d)!).toBe("4 children · min 1 · max 2 · quota 4");
    expect(field("fanout", d)!.getAttribute("data-tone")).toBe("lapsed");
  });

  it("follows a change to a queue form", async () => {
    const core = mount();
    await shown();
    fireEvent.click(nodeNamed("Widget Work", "queue"));
    await screen.findByText("Catalogue loader", undefined, { timeout: 3000 });
    const queueEntries = { ...widgetWork.form.queue! };
    for (const [id, e] of Object.entries(queueEntries)) if (e.title === "Catalogue loader") queueEntries[id] = { ...e, title: "Catalogue loader, renamed" };
    await act(async () => core.setRole(widgetWork.id, { ...widgetWork.form, queue: queueEntries }));
    await screen.findByText("Catalogue loader, renamed", undefined, { timeout: 3000 });
  });
});

describe("the order page: relations and queue forms", () => {
  it("points a study from the queue form to the studier, and a lease and a flow with their counts", async () => {
    mount();
    await shown();
    expect(edges("study").sort()).toEqual(["@c0de0102>" + aria("02"), "@c0de0103>" + aria("01"), "@c0de0104>" + aria("03")].sort());
    expect([...document.querySelectorAll("[data-edge=lease]")]).toHaveLength(4);
    expect([...document.querySelectorAll(".og-l-lease")].map((t) => t.textContent)).toContain("claimed 1, 1 lapsed");
    expect([...document.querySelectorAll(".og-l-flow")].map((t) => t.textContent)).toContain("posts 5");
  });

  it("lists the relations of a node, outgoing and incoming, as links to the other nodes", async () => {
    mount();
    await shown();
    const d = await open("Crown", "aria");
    const out = within(field("outgoing", d)!).getAllByRole("link").map((a) => a.textContent);
    expect(out).toEqual(expect.arrayContaining(["Frontier Knight", "Edge Engineer", "Deploy Queue"]));
    const inn = within(field("incoming", d)!).getAllByRole("link").map((a) => a.textContent);
    expect(inn).toEqual(expect.arrayContaining(["@Crown", "Review Queue"]));
    const link = within(field("outgoing", d)!).getAllByRole("link")[0]!;
    expect(link.getAttribute("href")).toMatch(/^#\/%40c0de0001/);
  });

  it("links a role to the queue forms it studies, and says which it cannot find", async () => {
    mount();
    await shown();
    const crown = await open("@Crown");
    const studies = [...crown.querySelectorAll("[data-field=study]")];
    expect(studies.map((c) => c.querySelector("dd")!.textContent)).toEqual(["Review Queue", "c0de0fff (not visible)"]);
    expect(studies[0]!.querySelector("a")!.getAttribute("href")).toBe(hash(CROWN, "@c0de0103"));
    expect(studies[1]!.querySelector("a")).toBeNull();
    expect((await open("@Frontier Knight")).querySelector("[data-field=study] a")!.getAttribute("href")).toBe(hash(CROWN, "@c0de0102"));
    expect((await open("@Widget Engineer")).querySelector("[data-field=study]")).toBeNull();
  });

  it("selects the queue form a study link names", async () => {
    mount();
    await shown();
    await open("@Crown");
    fireEvent.click(detail().querySelector("[data-field=study] a")!);
    await waitFor(() => expect(node("@c0de0103").classList.contains("og-sel")).toBe(true));
    expect(window.location.hash).toBe(hash(CROWN, "@c0de0103"));
  });

  it("keeps each queue as a tree, in queue order, with its kinds and contract", async () => {
    mount();
    await shown();
    const d = await open("Widget Work", "queue");
    await waitFor(() => expect(d.querySelectorAll(".ord-row").length).toBe(7));
    expect(d.querySelectorAll(".ord-tree .ord-tree").length).toBe(2);
    expect(field("kinds", d)!.textContent).toBe("work, handoff");
    expect(field("priority_map", d)).toBeNull();
    expect(field("queue_contract", d)!.textContent).toContain("v0: work, handoff, no priority");
    expect(field("queue_contract", d)!.querySelector("a")!.getAttribute("href")).toBe("https://contract.example.invalid/work-orders");
    expect(field("counts", d)!.textContent).toContain("1 blocked");
    expect(field("counts", d)!.textContent).toContain("2 need attention");
    fireEvent.click(nodeNamed("Review Queue", "queue"));
    await waitFor(() => expect(field("priority_map")!.textContent).toBe("by priority"));
  });

  it("says a queue form is empty", async () => {
    mount();
    await shown();
    const d = await open("Backend Handoff", "queue");
    await waitFor(() => expect(within(d).getByText("No work orders.")).toBeTruthy());
  });

  it("selects the node the address names, under its central command", async () => {
    window.location.hash = hash(CROWN, "@c0de0105");
    mount();
    await waitFor(() => expect(document.querySelector('[data-node="@c0de0105"]')?.classList.contains("og-sel")).toBe(true), { timeout: 3000 });
    expect(field("outgoing", detail())).not.toBeNull();
    expect(detail().querySelector(".og-title")!.textContent).toBe("Backend Handoff");
  });

  it("selects an aria by its id in the address, and a node by a short form id", async () => {
    window.location.hash = hash("@c0de0001", aria("03"));
    mount();
    await waitFor(() => expect(document.querySelector(`[data-node="${aria("03")}"]`)?.classList.contains("og-sel")).toBe(true), { timeout: 3000 });
    window.location.hash = hash("@c0de0001", "@c0de0105");
    await waitFor(() => expect(document.querySelector('[data-node="@c0de0105"]')?.classList.contains("og-sel")).toBe(true));
  });

  it("opens an entry in a sheet and names its amendments, under the node in the address", async () => {
    mount();
    await shown();
    fireEvent.click(nodeNamed("Widget Work", "queue"));
    const title = await screen.findByText("Catalogue loader", undefined, { timeout: 3000 });
    fireEvent.click(title);
    const sheet = await screen.findByRole("dialog", { name: "Work order" });
    expect(within(sheet).getByText("Amendments (1)")).toBeTruthy();
    expect(within(sheet).getByText("Blocked on the schema review.")).toBeTruthy();
    expect(window.location.hash.startsWith(hash(CROWN, widgetWork.id) + "/")).toBe(true);
  });
});

describe("the order page: the controls", () => {
  it("selects a node on click, dims the rest, and clears on a second click or the background", async () => {
    mount();
    await shown();
    fireEvent.click(node(aria("03")));
    await waitFor(() => expect(node(aria("03")).classList.contains("og-sel")).toBe(true));
    expect(window.location.hash).toBe(hash(CROWN, aria("03")));
    expect(node(aria("06")).classList.contains("og-dim")).toBe(true);
    expect(node(aria("01")).classList.contains("og-dim")).toBe(false);
    fireEvent.click(node(aria("03")));
    await waitFor(() => expect(node(aria("03")).classList.contains("og-sel")).toBe(false));
    expect(document.querySelectorAll(".og-node.og-dim")).toHaveLength(0);
    fireEvent.click(node(aria("03")));
    await waitFor(() => expect(node(aria("03")).classList.contains("og-sel")).toBe(true));
    fireEvent.click(document.querySelector(".og-svg")!);
    await waitFor(() => expect(document.querySelector(".og-sel")).toBeNull());
    expect(window.location.hash).toBe(hash(CROWN));
  });

  it("selects with Enter and with Space", async () => {
    mount();
    await shown();
    fireEvent.keyDown(node(aria("03")), { key: "Enter" });
    await waitFor(() => expect(node(aria("03")).getAttribute("aria-pressed")).toBe("true"));
    fireEvent.keyDown(node(aria("03")), { key: " " });
    await waitFor(() => expect(node(aria("03")).getAttribute("aria-pressed")).toBe("false"));
  });

  it("hides a relationship's edges when its chip is switched off, and brings them back", async () => {
    mount();
    await shown();
    const chip = document.querySelector<HTMLElement>('[data-chip="lease"]')!;
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelectorAll("[data-edge=lease].og-hide")).toHaveLength(4);
    expect(document.querySelectorAll("[data-edge=flow].og-hide")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "none" }));
    expect(document.querySelectorAll(".og-edge:not(.og-hide)")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "all" }));
    expect(document.querySelectorAll(".og-edge.og-hide")).toHaveLength(0);
  });

  it("narrows the lit edges to the outgoing or the incoming ones of the selection", async () => {
    mount();
    await shown();
    fireEvent.click(node(aria("03")));
    await waitFor(() => expect(node(aria("03")).classList.contains("og-sel")).toBe(true));
    const lit = (): string[] => [...document.querySelectorAll(".og-edge:not(.og-dim):not(.og-hide)")].map((e) => e.getAttribute("data-from") + ">" + e.getAttribute("data-to"));
    const both = lit();
    expect(both.length).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole("button", { name: /direction/ }));
    expect(lit().every((e) => e.startsWith(aria("03")))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /direction/ }));
    expect(lit().every((e) => e.endsWith(">" + aria("03")))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /direction/ }));
    expect(lit()).toEqual(both);
  });

  it("switches to the command view and back, in the address", async () => {
    mount();
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "central command" }));
    await waitFor(() => expect(document.querySelector('[data-field="graph"]')!.getAttribute("data-view")).toBe("command"));
    expect(window.location.hash).toBe(hash(CROWN) + "?view=command");
    expect(nodes().sort()).toEqual(["Bridge Knight", "Crown", "Edge Engineer", "Frontier Knight", "Review Queue"]);
    expect(edges("target")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "full graph" }));
    await waitFor(() => expect(document.querySelector('[data-field="graph"]')!.getAttribute("data-view")).toBe("full"));
    expect(window.location.hash).toBe(hash(CROWN));
  });

  it("opens in the command view when the address asks", async () => {
    window.location.hash = hash(CROWN) + "?view=command";
    mount();
    await waitFor(() => expect(nodes()).toHaveLength(5), { timeout: 3000 });
    expect(document.querySelector('[data-field="graph"]')!.getAttribute("data-view")).toBe("command");
  });

  it("starts the flow animation on request", async () => {
    mount();
    await shown();
    fireEvent.click(screen.getByRole("button", { name: "animate flow" }));
    expect(document.querySelector(".og-svg")!.classList.contains("og-anim")).toBe(true);
  });
});

describe("the order page: the address and what is missing", () => {
  it("renders the one central command the address names", async () => {
    window.location.hash = hash("@c0de0099");
    mount();
    await waitFor(() => expect(nodes("role")).toContain("@Rival Crown"), { timeout: 3000 });
    expect(nodes("role")).not.toContain("@Crown");
    await waitFor(() => expect(nodes("role")).toContain("@Stray Scribe"));
    expect(nodes("queue")).toEqual(["Rival Handoff"]);
    expect(window.location.hash).toBe(hash("@c0de0099"));
  });

  it("takes a short form id in the address for the long one the roster lists", async () => {
    window.location.hash = hash("@c0de0001");
    mount();
    await waitFor(() => expect(nodes("role")).toContain("@Crown"), { timeout: 3000 });
    expect(document.querySelector('[data-field="graph"]')!.getAttribute("data-central")).toBe(CROWN);
  });

  it("says a seat that is not a central command is not one, and points at its root", async () => {
    window.location.hash = hash("@c0de0002");
    mount();
    const note = await screen.findByText(/Frontier Knight is not a central command/, undefined, { timeout: 3000 });
    expect(note.querySelector("a")!.getAttribute("href")).toBe(hash(CROWN));
    expect(nodes()).toEqual([]);
  });

  it("says a queue form is not a central command", async () => {
    window.location.hash = hash("@c0de0101");
    mount();
    await screen.findByText("This form is a queue form, not a central command.", undefined, { timeout: 3000 });
  });

  it("says a form without a chartered object is not a chartered role", async () => {
    window.location.hash = hash("@7e1a0004");
    mount();
    await screen.findByText("This form is not a chartered role.", undefined, { timeout: 3000 });
  });

  it("says so when the address names a form nobody can read", async () => {
    window.location.hash = hash("@deadbeef");
    mount();
    await waitFor(() => expect(document.querySelector('[data-field="missing"]')!.textContent).toBe("Could not read this central command."), { timeout: 3000 });
  });

  it("says so when no form carries a chartered object", async () => {
    const plain = fixture.roles.map((r) => ({ ...r, form: Object.fromEntries(Object.entries(r.form).filter(([k]) => k !== "chartered")) }));
    mount({ roles: plain as Role[] });
    await screen.findByText("No chartered central command is visible to you.", undefined, { timeout: 3000 });
    expect(nodes()).toEqual([]);
  });

  it("names a chartered form the listing carries and nobody can read", async () => {
    const listing = JSON.parse(JSON.stringify(ariasGlobal)) as { arias: { null: { forks: Record<string, unknown> } } };
    listing.arias.null.forks["@ghost-form"] = { id: "@feedfacefeedfacefeedfacefeedface", kind: "form", state: "form", name: "Ghost", parent: "null", active_at: 1, recency: 1 };
    mount({ global: listing });
    await shown();
    await waitFor(() => expect(document.querySelector('[data-field="unreadable"]')?.textContent).toMatch(/1 chartered form is not readable: feedface \((could not be read|gone)\)/), { timeout: 3000 });
  });

  it("draws every form the listing carries when @arias lists only one role", async () => {
    mount();
    await shown();
    expect(nodes("role")).toHaveLength(8);
    expect(nodes("queue")).toHaveLength(5);
  });

  it("draws only the roles @arias lists, and says so, when the listing cannot be read", async () => {
    mount({ global: null });
    await waitFor(() => expect(document.querySelector('[data-field="listing-note"]')).not.toBeNull(), { timeout: 3000 });
    expect(document.querySelector('[data-field="listing-note"]')!.textContent).toContain("The form listing (@arias-global) is not readable");
    expect(nodes("role")).toEqual(["@Crown"]);
  });

  it("follows the listing: a form added to it appears, without any change to @arias", async () => {
    const core = mount();
    await shown();
    const late = { id: "@7e1a0009", name: "Late Lead", target: aria("0b"), form: { name: "Late Lead", "role-name": "Late Lead", "target-aria": aria("0b"), chartered: { seat: "lead", regiment: "frontend", root: "@c0de0001", "reports-to": "@c0de0002" } } };
    const listing = JSON.parse(JSON.stringify(ariasGlobal)) as { arias: { null: { forks: Record<string, unknown> } } };
    listing.arias.null.forks["@late-lead"] = { id: late.id, kind: "form", state: "form", name: late.name, target: late.target, parent: "null", active_at: 1, recency: 1 };
    await act(async () => {
      core.roles[late.id] = late;
      core.setGlobal(listing);
    });
    await waitFor(() => expect(nodes("role")).toContain("@Late Lead"), { timeout: 3000 });
  });

  it("shows chartered text as text", async () => {
    const hostile = fixture.roles.map((r) => (r.name === "Backend Lead" ? { ...r, form: { ...r.form, chartered: { ...(r.form.chartered as object), seat: "<img src=x onerror=\"window.__pwned=1\">" } } } : r));
    mount({ roles: hostile as Role[] });
    await shown();
    const d = await open("@Backend Lead");
    expect(fact("seat", d)!).toBe("<img src=x onerror=\"window.__pwned=1\">");
    expect(document.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
