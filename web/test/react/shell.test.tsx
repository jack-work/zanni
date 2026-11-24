import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Shell, type ShellProps } from "zanni-react";

const header = { mark: <a id="b-repo">fx</a>, identity: <span id="b-crumbs">src/app.go</span>, nav: <a id="b-history">History</a> };

function shell(extra: Partial<ShellProps> = {}) {
  const hosts = vi.fn();
  const props: ShellProps = { header, left: { id: "tree", label: "files" }, right: { id: "pane", label: "comments" }, storage: "paperd", hosts, ...extra };
  return { hosts, props, view: render(<Shell {...props} />) };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("Shell", () => {
  it("hands its hosts over once, after the first commit, however often it re-renders", () => {
    const { hosts, props, view } = shell();
    expect(hosts).toHaveBeenCalledTimes(1);
    const got = hosts.mock.calls[0]![0];
    expect(got.main.id).toBe("main");
    expect(got.left.closest("#tree")).not.toBeNull();
    expect(got.right.closest("#pane")).not.toBeNull();
    got.main.appendChild(document.createElement("hr"));
    view.rerender(<Shell {...props} header={{ ...header, identity: <span id="b-crumbs">src/other.go</span> }} />);
    expect(hosts).toHaveBeenCalledTimes(1);
    expect(got.main.querySelector("hr")).not.toBeNull();
  });

  it("renders the stable control ids and the slots in the agreed order", () => {
    shell();
    const ids = [...document.querySelectorAll("#bar button, #bar a, #bar span[id]")].map((n) => n.id);
    expect(ids).toEqual(["b-tree", "b-repo", "b-crumbs", "b-history", "b-theme", "b-pane", ""]);
  });

  it("remembers a pane as JSON {w, open}, and ignores a stored 0 or 1", () => {
    localStorage.setItem("paperd.tree", "0");
    localStorage.setItem("paperd.pane", JSON.stringify({ w: 410, open: false }));
    shell();
    expect(screen.getByRole("navigation", { name: "files" }).hasAttribute("data-open")).toBe(true);
    expect(document.getElementById("pane")!.hasAttribute("data-open")).toBe(false);
    expect(JSON.parse(localStorage.getItem("paperd.tree")!)).toEqual({ w: 280, open: true });
    fireEvent.click(document.getElementById("b-pane")!);
    expect(JSON.parse(localStorage.getItem("paperd.pane")!)).toEqual({ w: 410, open: true });
  });

  it("owns html[data-theme]: a pick that differs from the system is stored, the system's own scheme forgets it", () => {
    const onTheme = vi.fn();
    shell({ onTheme });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("paperd.theme")).toBeNull();
    fireEvent.click(document.getElementById("b-theme")!);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("paperd.theme")).toBe("dark");
    expect(onTheme).toHaveBeenLastCalledWith("dark");
    fireEvent.click(document.getElementById("b-theme")!);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("paperd.theme")).toBeNull();
  });

  it("draws the left tabs and reports a pick", () => {
    const onTab = vi.fn();
    shell({ left: { id: "tree", label: "files", tabs: ["Files", "Pages"], onTab } });
    expect(screen.getByRole("tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
    act(() => screen.getByRole("tab", { name: "Pages" }).click());
    expect(onTab).toHaveBeenCalledWith("Pages");
    expect(localStorage.getItem("paperd.tree.tab")).toBe("Pages");
  });

  it("lets the host control a pane's open state", () => {
    const onOpen = vi.fn();
    const { props, view } = shell({ right: { id: "pane", label: "comments", open: false, onOpen } });
    fireEvent.click(document.getElementById("b-pane")!);
    expect(onOpen).toHaveBeenCalledWith(true);
    expect(document.getElementById("pane")!.hasAttribute("data-open")).toBe(false);
    view.rerender(<Shell {...props} right={{ id: "pane", label: "comments", open: true, onOpen }} />);
    expect(document.getElementById("pane")!.hasAttribute("data-open")).toBe(true);
  });
});
