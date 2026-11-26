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
const byName = (name: string): Role => fixture.roles.find((r) => r.name === name)!;
const widgetWork = byName("Widget Work");
const aria = (hex: string): string => ("c0ffee" + hex).repeat(4);
const CROWN = "@c0de0001c0de0001c0de0001c0de0001";
const hash = (...parts: string[]): string => "#/" + parts.map(encodeURIComponent).join("/");

function mount(o: { roles?: Role[]; topology?: Record<string, string> } = {}) {
  const core = (mock as unknown as { create(o: object): any }).create({ step: 1, roles: o.roles ?? fixture.roles, topology: o.topology ?? fixture.topology });
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

const texts = (selector: string, within: ParentNode = document): string[] => [...within.querySelectorAll(selector)].map((e) => e.textContent ?? "");
const names = (): string[] => texts(".ord-role-name");
const queueNames = (): string[] => texts(".ord-queue-name");
const seat = (hex: string): HTMLElement => document.querySelector<HTMLElement>(`.ord-seat[data-aria="${aria(hex)}"]`)!;
const role = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>(".ord-role")].find((r) => r.querySelector(".ord-role-name")!.textContent === name)!;
const queue = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>(".ord-queue")].find((r) => r.querySelector(".ord-queue-name")!.textContent === name)!;
const field = (el: HTMLElement, name: string): HTMLElement | null => el.querySelector(`[data-field=${name}]`);
const childSeats = (hex: string): string[] => [...seat(hex).querySelectorAll(":scope > .ord-seats > .ord-seat")].map((li) => li.querySelector(".ord-role-name")!.textContent ?? "");
const shown = async (): Promise<void> => void (await waitFor(() => expect(document.querySelectorAll(".ord-role").length).toBeGreaterThan(5), { timeout: 3000 }));

afterEach(() => {
  window.location.hash = "";
});

describe("the order page: the tree", () => {
  it("shows only the chartered roles of one central command, the drawn tree first", async () => {
    mount();
    await shown();
    expect(names()).toEqual(["Crown", "Frontier Knight", "Frontier Strategist", "Widget Engineer", "Edge Engineer", "Bridge Knight", "Backend Lead", "Lost Lead"]);
    expect(field(document.body, "central")!.textContent).toBe("Central command: Crown");
  });

  it("carries the discovered central command in the address", async () => {
    mount();
    await shown();
    await waitFor(() => expect(window.location.hash).toBe(hash(CROWN)));
  });

  it("nests each chartered seat under its nearest chartered ancestor in the drawn tree", async () => {
    mount();
    await shown();
    expect(childSeats("01")).toEqual(["Frontier Knight", "Edge Engineer"]);
    expect(childSeats("02")).toEqual(["Frontier Strategist", "Widget Engineer"]);
    expect(childSeats("06")).toEqual([]);
    expect(childSeats("05")).toEqual([]);
  });

  it("names the holder, the seat, the regiment and the fan-out against the drawn children", async () => {
    mount();
    await shown();
    const knight = role("Frontier Knight");
    expect(within(knight).getByText("held by Frontend Engineer / figchat web")).toBeTruthy();
    expect(field(knight, "seat")!.textContent).toBe("knight");
    expect(field(knight, "regiment")!.textContent).toBe("frontend");
    expect(field(knight, "fanout")!.textContent).toBe("2 children · min 1 · max 2 · quota 4");
    expect(field(role("Frontier Strategist"), "fanout")!.textContent).toBe("0 children · max 1 · quota 3");
    expect(field(role("Edge Engineer"), "fanout")!.textContent).toBe("0 children · max 1 · quota 1");
    expect(field(role("Crown"), "fanout")).toBeNull();
    expect(field(role("Crown"), "central")!.textContent).toBe("central command");
  });

  it("collapses the unchartered arias between two chartered seats and says so", async () => {
    mount();
    await shown();
    expect(field(role("Widget Engineer"), "skipped")!.textContent).toBe("skips 1 unchartered");
    expect(field(role("Frontier Strategist"), "skipped")).toBeNull();
  });

  it("flags only the seats drawn somewhere other than where their charter reports", async () => {
    mount();
    await shown();
    expect(field(role("Widget Engineer"), "mismatch")!.textContent).toBe("drawn under Frontier Knight, charter says Frontier Strategist");
    expect(field(role("Bridge Knight"), "mismatch")!.textContent).toBe("drawn outside the command, charter says Crown");
    for (const n of ["Crown", "Frontier Knight", "Frontier Strategist", "Edge Engineer"]) expect(field(role(n), "mismatch"), n).toBeNull();
  });

  it("lists the seats drawn outside the command, the vacant ones and the stray queue forms apart from the tree", async () => {
    mount();
    await shown();
    expect(texts(".ord-role-name", document.querySelector('[data-field="apart"]')!)).toEqual(["Bridge Knight"]);
    expect(texts(".ord-role-name", document.querySelector('[data-field="vacant"]')!)).toEqual(["Backend Lead", "Lost Lead"]);
    expect(within(role("Backend Lead")).getByText("vacant")).toBeTruthy();
    expect(within(role("Lost Lead")).getByText("holder not visible: c0ffeefe")).toBeTruthy();
    expect(texts(".ord-queue-name", document.querySelector('[data-field="strays"]')!)).toEqual(["Review Queue"]);
    expect(field(queue("Review Queue"), "under")!.textContent).toBe("drawn under c0de0008");
  });

  it("hides a role form without a chartered object, a seat of another command, and its queue forms", async () => {
    mount();
    await shown();
    for (const n of ["Idle Scout", "Stray Scribe", "Rival Crown"]) expect(names()).not.toContain(n);
    expect(queueNames()).not.toContain("Rival Handoff");
  });

  it("follows @topology: dropping the override moves the seat out of the tree", async () => {
    const core = mount();
    await shown();
    expect(childSeats("02")).toContain("Widget Engineer");
    await act(async () => core.setTopology({}));
    await waitFor(() => expect(texts(".ord-role-name", document.querySelector('[data-field="apart"]')!)).toEqual(["Bridge Knight", "Widget Engineer"]), { timeout: 3000 });
    expect(childSeats("02")).toEqual(["Frontier Strategist"]);
    expect(field(role("Frontier Knight"), "fanout")!.textContent).toBe("1 child · min 1 · max 2 · quota 4");
    expect(field(role("Widget Engineer"), "mismatch")!.textContent).toBe("drawn outside the command, charter says Frontier Strategist");
    expect(field(role("Widget Engineer"), "skipped")).toBeNull();
  });

  it("follows @topology: drawing a seat where its charter reports clears the flag", async () => {
    const core = mount();
    await shown();
    expect(field(role("Widget Engineer"), "mismatch")).not.toBeNull();
    await act(async () => core.setTopology({ ...fixture.topology, [aria("05")]: aria("06") }));
    await waitFor(() => expect(field(role("Widget Engineer"), "mismatch")).toBeNull(), { timeout: 3000 });
    expect(childSeats("06")).toEqual(["Widget Engineer"]);
    expect(field(role("Widget Engineer"), "skipped")).toBeNull();
    expect(field(role("Frontier Strategist"), "fanout")!.textContent).toBe("1 child · max 1 · quota 3");
  });

  it("shows a fan-out over its maximum", async () => {
    const core = mount();
    await shown();
    await act(async () => core.setTopology({ ...fixture.topology, [aria("09")]: aria("02"), [aria("0b")]: aria("02") }));
    await waitFor(() => expect(field(role("Frontier Knight"), "fanout")!.textContent).toBe("4 children · min 1 · max 2 · quota 4"), { timeout: 3000 });
    expect(field(role("Frontier Knight"), "fanout")!.getAttribute("data-tone")).toBe("lapsed");
  });

  it("shows the charter facts on a role", async () => {
    mount();
    await shown();
    const facts = role("Widget Engineer").querySelector(".ord-charter")!;
    expect(facts.querySelector("[data-field=reports_to] dd")!.textContent).toContain("Frontier Strategist");
    expect(facts.querySelector("[data-field=reports_to] dd")!.textContent).toContain("not where it is drawn");
    expect(facts.querySelector("[data-field=succession] dd")!.textContent).toBe("retire, ttl 5m");
  });
});

describe("the order page: queue forms", () => {
  it("draws each queue form under the role it is drawn under", async () => {
    mount();
    await shown();
    expect(queueNames()).toEqual(["Deploy Queue", "Frontier Handoff", "Widget Work", "Backend Handoff", "Review Queue"]);
    const under = (name: string): string => queue(name).closest(".ord-seat")!.querySelector(".ord-role-name")!.textContent ?? "";
    expect(under("Deploy Queue")).toBe("Frontier Knight");
    expect(under("Frontier Handoff")).toBe("Frontier Strategist");
    expect(under("Widget Work")).toBe("Widget Engineer");
    expect(under("Backend Handoff")).toBe("Bridge Knight");
  });

  it("keeps each queue as a tree, in queue order", async () => {
    mount();
    await shown();
    const section = document.querySelector<HTMLElement>(`[data-queue="${widgetWork.id}"]`)!;
    await waitFor(() => expect(section.querySelectorAll(".ord-row").length).toBe(7));
    expect(section.querySelectorAll(".ord-tree .ord-tree").length).toBe(2);
  });

  it("names the kinds and the contract on a queue form, and marks the priority map", async () => {
    mount();
    await shown();
    expect(field(queue("Widget Work"), "kinds")!.textContent).toBe("work, handoff");
    expect(field(queue("Widget Work"), "priority_map")).toBeNull();
    expect(field(queue("Review Queue"), "priority_map")!.textContent).toBe("by priority");
    expect(field(queue("Widget Work"), "queue_contract")!.textContent).toContain("v0: work, handoff, no priority");
    expect(field(queue("Widget Work"), "queue_contract")!.querySelector("a")!.getAttribute("href")).toBe("https://contract.example.invalid/work-orders");
  });

  it("links a role to the queue forms it studies, and says which it cannot find", async () => {
    mount();
    await shown();
    const crownStudies = [...role("Crown").querySelectorAll("[data-field=study]")];
    expect(crownStudies.map((c) => c.textContent)).toEqual(["studies Review Queue", "studies c0de0fff (not visible)"]);
    expect(crownStudies[0]!.querySelector("a")!.getAttribute("href")).toBe(hash(CROWN, "@c0de0103"));
    expect(crownStudies[1]!.querySelector("a")).toBeNull();
    expect(role("Frontier Knight").querySelector("[data-field=study] a")!.getAttribute("href")).toBe(hash(CROWN, "@c0de0102"));
    expect(role("Edge Engineer").querySelector("[data-field=study] a")!.getAttribute("href")).toBe(hash(CROWN, "@c0de0104"));
    expect(role("Widget Engineer").querySelector("[data-field=study]")).toBeNull();
  });

  it("opens the queue form a study link names", async () => {
    mount();
    await shown();
    fireEvent.click(role("Crown").querySelector("[data-field=study] a")!);
    await waitFor(() => expect(queue("Review Queue").getAttribute("data-focused")).toBe("true"));
    expect((queue("Review Queue") as HTMLDetailsElement).open).toBe(true);
  });

  it("opens a queue form straight from the address", async () => {
    window.location.hash = hash(CROWN, "@c0de0105");
    mount();
    await waitFor(() => expect(queue("Backend Handoff")?.getAttribute("data-focused")).toBe("true"), { timeout: 3000 });
    expect((queue("Backend Handoff") as HTMLDetailsElement).open).toBe(true);
  });

  it("opens an entry in a sheet and names its amendments, under the central command in the address", async () => {
    mount();
    const title = await screen.findByText("Catalogue loader", undefined, { timeout: 3000 });
    fireEvent.click(title);
    const sheet = await screen.findByRole("dialog", { name: "Work order" });
    expect(within(sheet).getByText("Amendments (1)")).toBeTruthy();
    expect(within(sheet).getByText("Blocked on the schema review.")).toBeTruthy();
    expect(window.location.hash.startsWith(hash(CROWN, widgetWork.id) + "/")).toBe(true);
  });

  it("follows a change to a queue form", async () => {
    const core = mount();
    await screen.findByText("Catalogue loader", undefined, { timeout: 3000 });
    const queueEntries = { ...widgetWork.form.queue! };
    for (const [id, e] of Object.entries(queueEntries)) if (e.title === "Catalogue loader") queueEntries[id] = { ...e, title: "Catalogue loader, renamed" };
    await act(async () => core.setRole(widgetWork.id, { ...widgetWork.form, queue: queueEntries }));
    await screen.findByText("Catalogue loader, renamed", undefined, { timeout: 3000 });
  });
});

describe("the order page: the address and what is missing", () => {
  it("renders the one central command the address names", async () => {
    window.location.hash = hash("@c0de0099");
    mount();
    await waitFor(() => expect(names()).toContain("Rival Crown"), { timeout: 3000 });
    expect(names()).not.toContain("Crown");
    await waitFor(() => expect(document.querySelector('[data-field="apart"]')!.textContent).toContain("Stray Scribe"));
    expect(queueNames()).toEqual(["Rival Handoff"]);
    expect(window.location.hash).toBe(hash("@c0de0099"));
  });

  it("takes a short form id in the address for the long one the roster lists", async () => {
    window.location.hash = hash("@c0de0001");
    mount();
    await waitFor(() => expect(names()).toContain("Crown"), { timeout: 3000 });
    expect(document.querySelector('[data-field="roles"]')!.getAttribute("data-central")).toBe(CROWN);
  });

  it("says a seat that is not a central command is not one, and points at its root", async () => {
    window.location.hash = hash("@c0de0002");
    mount();
    const note = await screen.findByText(/Frontier Knight is not a central command/, undefined, { timeout: 3000 });
    expect(note.querySelector("a")!.getAttribute("href")).toBe(hash(CROWN));
    expect(names()).toEqual([]);
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
    expect(names()).toEqual([]);
  });

  it("shows chartered text as text", async () => {
    const hostile = fixture.roles.map((r) => (r.name === "Backend Lead" ? { ...r, form: { ...r.form, chartered: { ...(r.form.chartered as object), seat: "<img src=x onerror=\"window.__pwned=1\">" } } } : r));
    mount({ roles: hostile as Role[] });
    await shown();
    expect(field(role("Backend Lead"), "seat")!.textContent).toBe("<img src=x onerror=\"window.__pwned=1\">");
    expect(role("Backend Lead").querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
