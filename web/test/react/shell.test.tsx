import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Shell, type ShellProps } from "zanni-react";

const header = { mark: <a id="b-repo">fx</a>, identity: <span id="b-crumbs">src/app.go</span>, nav: <a id="b-history">History</a> };

function shell(extra: Partial<ShellProps> = {}) {
  const hosts = vi.fn();
  const props: ShellProps = { header, storage: "paperd", hosts, ...extra };
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
    got.main.appendChild(document.createElement("hr"));
    view.rerender(<Shell {...props} header={{ ...header, identity: <span id="b-crumbs">src/other.go</span> }} />);
    expect(hosts).toHaveBeenCalledTimes(1);
    expect(got.main.querySelector("hr")).not.toBeNull();
  });

  it("renders the stable control ids and the slots in the agreed order", () => {
    shell();
    const ids = [...document.querySelectorAll("#bar button, #bar a, #bar span[id]")].map((n) => n.id);
    expect(ids).toEqual(["b-repo", "b-crumbs", "b-history", "b-theme", ""]);
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
});
