import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, Pit, PitGrip, PitProvider, pitFaces, pitHeight, pitSettle, pitStep, marks } from "zanni-react";

const H = 800;

describe("pitSettle", () => {
  it("snaps closed below a quarter, half between, full once past the top 15 percent", () => {
    expect(pitSettle(100, H, 0)).toBe("closed");
    expect(pitSettle(199, H, 0)).toBe("closed");
    expect(pitSettle(200, H, 0)).toBe("half");
    expect(pitSettle(400, H, 0)).toBe("half");
    expect(pitSettle(679, H, 0)).toBe("half");
    expect(pitSettle(680, H, 0)).toBe("full");
    expect(pitSettle(800, H, 0)).toBe("full");
  });

  it("lets a flick carry to the next stop in its direction", () => {
    expect(pitSettle(60, H, 1.2)).toBe("half");
    expect(pitSettle(400, H, 1.2)).toBe("full");
    expect(pitSettle(500, H, 1.2)).toBe("full");
    expect(pitSettle(700, H, -1.2)).toBe("half");
    expect(pitSettle(400, H, -1.2)).toBe("closed");
    expect(pitSettle(60, H, -1.2)).toBe("closed");
  });

  it("treats a slow release as no flick", () => {
    expect(pitSettle(60, H, 0.49)).toBe("closed");
  });
});

describe("pit geometry", () => {
  it("measures the stops and steps between them without wrapping", () => {
    expect([pitHeight("closed", H), pitHeight("half", H), pitHeight("full", H)]).toEqual([0, 400, 800]);
    expect(pitStep("closed", 1)).toBe("half");
    expect(pitStep("half", 1)).toBe("full");
    expect(pitStep("full", 1)).toBe("full");
    expect(pitStep("closed", -1)).toBe("closed");
  });
});

function Harness() {
  return (
    <PitProvider>
      <PitGrip />
      <Pit label="Controls" title="Pit" glyph={pitFaces.form.glyph} docked>
        <Button>Inside</Button>
      </Pit>
    </PitProvider>
  );
}

describe("Pit", () => {
  it("draws nothing without a provider and nothing while closed", () => {
    render(<Pit label="Controls" title="Pit"><p>x</p></Pit>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens to half from the keyboard, steps with the arrows, and closes on Escape", () => {
    render(<Harness />);
    const grip = screen.getByRole("button", { name: "Open controls" });
    expect(grip.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    grip.focus();
    fireEvent.click(grip);
    const dialog = screen.getByRole("dialog", { name: "Controls" });
    expect(dialog.getAttribute("data-snap")).toBe("half");
    expect(grip.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByText("Inside"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize" }), { key: "ArrowUp" });
    expect(dialog.getAttribute("data-snap")).toBe("full");
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize" }), { key: "ArrowDown" });
    expect(dialog.getAttribute("data-snap")).toBe("half");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(grip.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(grip);
  });

  it("opens on a tap of the grip and closes on the Close button", () => {
    render(<Harness />);
    const grip = screen.getByRole("button", { name: "Open controls" });
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientY: 700 });
    fireEvent.pointerUp(grip, { pointerId: 1, button: 0, clientY: 700 });
    expect(screen.getByRole("dialog").getAttribute("data-snap")).toBe("half");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("follows a drag from the grip and settles on the stop it reached", () => {
    Object.defineProperty(window, "innerHeight", { value: H, configurable: true });
    render(<Harness />);
    const grip = screen.getByRole("button", { name: "Open controls" });
    fireEvent.pointerDown(grip, { pointerId: 2, button: 0, clientY: 800, timeStamp: 0 });
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 2, clientY: 500, timeStamp: 400 });
    });
    expect(screen.getByRole("dialog").hasAttribute("data-dragging")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--zr-pit-h")).toBe("300px");
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 2, clientY: 60, timeStamp: 900 });
    });
    expect(document.documentElement.style.getPropertyValue("--zr-pit-h")).toBe("740px");
    fireEvent.pointerUp(grip, { pointerId: 2, clientY: 60, timeStamp: 1400 });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-snap")).toBe("full");
    expect(dialog.hasAttribute("data-dragging")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--zr-pit-h")).toBe("800px");
  });

  it("pulls the pager's glyph from the table", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
    expect(document.querySelector(".zr-pit-glyph")!.textContent).toBe("웃");
    expect(marks.delta).toBe("Δ");
    expect(marks.fork).toBe("⑂");
  });
});
