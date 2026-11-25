import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionBar, Button, Fold, LatestPill, PlayerIsland } from "zanni-react";

describe("PlayerIsland", () => {
  it("draws nothing until asked, then owns one player for the clip and replaces it on the next request", () => {
    const src = (k: string) => "/audio/" + k;
    const { container, rerender, unmount } = render(<PlayerIsland request={null} src={src} />);
    expect(container.querySelector(".voce")).toBeNull();
    act(() => rerender(<PlayerIsland request={{ key: "home/a:1/in" }} src={src} />));
    expect(container.querySelectorAll(".voce")).toHaveLength(1);
    const first = container.querySelector(".voce");
    act(() => rerender(<PlayerIsland request={{ key: "home/a:1/in" }} src={src} />));
    expect(container.querySelectorAll(".voce")).toHaveLength(1);
    expect(container.querySelector(".voce")).not.toBe(first);
    unmount();
  });
});

describe("the small parts", () => {
  it("LatestPill clicks", () => {
    const go = vi.fn();
    render(<LatestPill onClick={go} />);
    fireEvent.click(screen.getByRole("button", { name: "Latest" }));
    expect(go).toHaveBeenCalled();
  });

  it("Fold is a closed details with a caret summary; ActionBar holds its buttons", () => {
    render(
      <>
        <Fold summary="Thinking" className="mine">
          hmm
        </Fold>
        <ActionBar>
          <Button>Play</Button>
        </ActionBar>
      </>,
    );
    const d = document.querySelector("details")!;
    expect(d.open).toBe(false);
    expect(d.className).toContain("mine");
    expect(d.querySelector("summary .nodi-caret")).toBeTruthy();
    expect(document.querySelector(".zr-actionbar button")!.textContent).toBe("Play");
  });
});
