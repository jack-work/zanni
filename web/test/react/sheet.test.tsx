import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, Sheet } from "zanni-react";

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet open={open} onClose={() => { onClose(); setOpen(false); }} title="Turn 3" label="Actions" className="mine" data={{ "data-kind": "input" }}>
        <Button>One</Button>
        <Button data-autofocus="">Two</Button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("renders nothing while closed, then a labelled modal dialog with its title and data attributes", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("Open"));
    const d = screen.getByRole("dialog", { name: "Actions" });
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.className).toContain("mine");
    expect(d.getAttribute("data-kind")).toBe("input");
    expect(d.querySelector(".zr-sheet-title")!.textContent).toBe("Turn 3");
  });

  it("focuses the marked control, closes on Escape, and gives focus back", () => {
    const close = vi.fn();
    render(<Harness onClose={close} />);
    const opener = screen.getByText("Open");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByText("Two"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes from the scrim and the Close button", () => {
    const close = vi.fn();
    render(<Harness onClose={close} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(document.querySelector(".zr-scrim")!);
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("keeps Tab inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    const close = screen.getByRole("button", { name: "Close" });
    const two = screen.getByText("Two");
    two.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(two);
  });
});
