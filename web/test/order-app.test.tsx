import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { AriaClient } from "figaro-forms/aria";
import { App } from "../src/order/app";
import { orderClientAtom } from "../src/order/state";
import { mock } from "./mock";

type Role = { id: string; name: string; form: { queue: Record<string, Record<string, unknown>> } & Record<string, unknown> };
const fixture = JSON.parse(readFileSync("test/fixtures/order-queues.json", "utf8")) as { roles: Role[] };
const widget = fixture.roles[0]!;

function mount() {
  const core = (mock as unknown as { create(o: object): any }).create({ step: 1, roles: fixture.roles });
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

afterEach(() => {
  window.location.hash = "";
});

describe("the order page", () => {
  it("lists the roles with their holders and each role's entries", async () => {
    mount();
    await waitFor(() => expect(document.querySelectorAll(".ord-role").length).toBe(4), { timeout: 3000 });
    const section = document.querySelector<HTMLElement>(`[data-role="${widget.id}"]`)!;
    expect(within(section).getByText("held by zanni")).toBeTruthy();
    await waitFor(() => expect(section.querySelectorAll(".ord-row").length).toBe(7));
    expect(section.querySelectorAll(".ord-tree .ord-tree").length).toBe(2);
  });

  it("opens an entry in a sheet and names its amendments", async () => {
    mount();
    const title = await screen.findByText("Catalogue loader", undefined, { timeout: 3000 });
    fireEvent.click(title);
    const sheet = await screen.findByRole("dialog", { name: "Work order" });
    expect(within(sheet).getByText("Amendments (1)")).toBeTruthy();
    expect(within(sheet).getByText("Blocked on the schema review.")).toBeTruthy();
    expect(window.location.hash).toContain(encodeURIComponent(widget.id));
  });

  it("follows a change to the role form", async () => {
    const core = mount();
    await screen.findByText("Catalogue loader", undefined, { timeout: 3000 });
    const queue = { ...widget.form.queue };
    for (const [id, e] of Object.entries(queue)) if (e.title === "Catalogue loader") queue[id] = { ...e, title: "Catalogue loader, renamed" };
    await act(async () => core.setRole(widget.id, { ...widget.form, queue }));
    await screen.findByText("Catalogue loader, renamed", undefined, { timeout: 3000 });
  });
});
