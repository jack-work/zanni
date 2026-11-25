import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, PIT_HALF_MIN, Pit, glyphs, pitDetents, pitRubber, pitSettle, pitStep, pitStop, type PitFrame, type PitSnap } from "zanni-react";

const F: PitFrame = { view: 800, rest: 100, top: 0 };
const ALL: PitSnap[] = ["closed", "half", "full"];

describe("pit stops", () => {
  it("rests the head at the bottom, the middle, and the top", () => {
    expect(pitStop("closed", F)).toBe(0);
    expect(pitStop("half", F)).toBe(-300);
    expect(pitStop("full", F)).toBe(-700);
    expect(pitStop("full", { ...F, top: 47 })).toBe(-653);
  });

  it("offers half only when the screen is tall enough", () => {
    expect(pitDetents(ALL, PIT_HALF_MIN)).toEqual(ALL);
    expect(pitDetents(ALL, PIT_HALF_MIN - 1)).toEqual(["closed", "full"]);
    expect(pitDetents(["closed", "full"], 900)).toEqual(["closed", "full"]);
  });

  it("steps between the stops it offers without wrapping", () => {
    expect(pitStep("closed", 1, ALL)).toBe("half");
    expect(pitStep("half", 1, ALL)).toBe("full");
    expect(pitStep("full", 1, ALL)).toBe("full");
    expect(pitStep("closed", -1, ALL)).toBe("closed");
    expect(pitStep("closed", 1, ["closed", "full"])).toBe("full");
  });

  it("damps a pull past the top and refuses a push below the bottom", () => {
    expect(pitRubber(-400, F)).toBe(-400);
    expect(pitRubber(40, F)).toBe(0);
    const over = pitRubber(-900, F);
    expect(over).toBeLessThan(-700);
    expect(over).toBeGreaterThan(-900);
  });
});

describe("pitSettle", () => {
  it("rests on the nearest stop when released slowly", () => {
    expect(pitSettle(-100, 0, F, ALL)).toBe("closed");
    expect(pitSettle(-200, 0, F, ALL)).toBe("half");
    expect(pitSettle(-480, 0, F, ALL)).toBe("half");
    expect(pitSettle(-560, 0, F, ALL)).toBe("full");
  });

  it("lets a flick carry to the next stop in its direction", () => {
    expect(pitSettle(-30, -0.5, F, ALL)).toBe("half");
    expect(pitSettle(-320, -0.5, F, ALL)).toBe("full");
    expect(pitSettle(-650, 0.5, F, ALL)).toBe("half");
    expect(pitSettle(-280, 0.5, F, ALL)).toBe("closed");
  });

  it("lets a hard flick skip a stop", () => {
    expect(pitSettle(-30, -3, F, ALL)).toBe("full");
    expect(pitSettle(-680, 3, F, ALL)).toBe("closed");
  });

  it("goes straight between closed and full without a half stop", () => {
    expect(pitSettle(-200, 0, F, ["closed", "full"])).toBe("closed");
    expect(pitSettle(-400, 0, F, ["closed", "full"])).toBe("full");
    expect(pitSettle(-30, -0.5, F, ["closed", "full"])).toBe("full");
  });
});

function Harness({ head = true }: { head?: boolean }) {
  const [snap, setSnap] = useState<PitSnap>("closed");
  return (
    <Pit snap={snap} onSnapChange={setSnap} label="Controls" docked head={head ? <textarea aria-label="Message" defaultValue="draft" /> : undefined}>
      <Button>Inside</Button>
    </Pit>
  );
}

function drawer(): HTMLElement {
  return document.querySelector<HTMLElement>(".zr-pit")!;
}

describe("Pit", () => {
  afterEach(() => {
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true });
  });

  it("is one element whose head is the composer, with no dialog while closed", () => {
    render(<Harness />);
    expect(document.querySelectorAll(".zr-pit").length).toBe(1);
    expect(drawer().querySelector(".zr-pit-head textarea")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Inside")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("names the knob for what it will do, and offers a visible Close while open", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<Harness />);
    const knob = drawer().querySelector<HTMLElement>(".zr-pit-knob")!;
    expect(knob.getAttribute("aria-label")).toBe("Open controls");
    fireEvent.click(knob);
    expect(knob.getAttribute("aria-label")).toBe("Close controls");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(drawer().getAttribute("data-snap")).toBe("closed");
    expect(knob.getAttribute("aria-label")).toBe("Open controls");
  });

  it("opens once from a pen tap and does not toggle back on the click that follows", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<Harness />);
    const knob = drawer().querySelector<HTMLElement>(".zr-pit-knob")!;
    fireEvent.pointerDown(knob, { pointerId: 4, pointerType: "pen", button: 0, isPrimary: true, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(knob, { pointerId: 4, pointerType: "pen", clientX: 100, clientY: 100 });
    fireEvent.click(knob);
    expect(drawer().getAttribute("data-snap")).toBe("half");
  });

  it("opens from the knob, steps with the arrows, and closes on Escape", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<Harness />);
    const knob = screen.getByRole("button", { name: "Open controls" });
    knob.focus();
    fireEvent.click(knob);
    const dialog = screen.getByRole("dialog", { name: "Controls" });
    expect(dialog).toBe(drawer());
    expect(dialog.getAttribute("data-snap")).toBe("half");
    expect(knob.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByText("Inside"));
    fireEvent.keyDown(knob, { key: "ArrowUp" });
    expect(drawer().getAttribute("data-snap")).toBe("full");
    fireEvent.keyDown(knob, { key: "ArrowDown" });
    expect(drawer().getAttribute("data-snap")).toBe("half");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(drawer().getAttribute("data-snap")).toBe("closed");
    expect(knob.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles closed from the knob", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<Harness />);
    const knob = screen.getByRole("button", { name: "Open controls" });
    fireEvent.click(knob);
    expect(drawer().getAttribute("data-snap")).toBe("half");
    fireEvent.click(knob);
    expect(drawer().getAttribute("data-snap")).toBe("closed");
  });

  it("opens straight to full on a short screen", () => {
    Object.defineProperty(window, "innerHeight", { value: PIT_HALF_MIN - 40, configurable: true });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
    expect(drawer().getAttribute("data-snap")).toBe("full");
  });

  it("keeps the composer focused when it opens over a draft", () => {
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Message" });
    box.focus();
    fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
    expect(drawer().hasAttribute("data-open")).toBe(true);
    expect(document.activeElement).toBe(box);
    expect((box as HTMLTextAreaElement).value).toBe("draft");
  });

  it("follows a drag from anywhere on the head by transform alone and settles on the stop it reached", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Message" });
    const before = document.documentElement.getAttribute("style");
    fireEvent.pointerDown(box, { pointerId: 2, button: 0, isPrimary: true, clientX: 100, clientY: 780, timeStamp: 0 });
    act(() => {
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 100, clientY: 770, timeStamp: 100 });
    });
    act(() => {
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 100, clientY: 480, timeStamp: 400 });
    });
    expect(drawer().hasAttribute("data-dragging")).toBe(true);
    expect(drawer().style.transform).toBe("translate3d(0px, -300px, 0px)");
    expect(document.documentElement.getAttribute("style")).toBe(before);
    act(() => {
      fireEvent.pointerMove(window, { pointerId: 2, clientX: 100, clientY: 60, timeStamp: 900 });
    });
    act(() => {
      fireEvent.pointerUp(window, { pointerId: 2, clientX: 100, clientY: 60, timeStamp: 1400 });
    });
    expect(drawer().getAttribute("data-snap")).toBe("full");
    expect(drawer().hasAttribute("data-dragging")).toBe(false);
    expect(drawer().style.transform).toBe("");
  });

  it("leaves a mouse drag over the text field to the text selection", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.pointerDown(box, { pointerId: 5, pointerType: "mouse", button: 0, isPrimary: true, clientX: 100, clientY: 780, timeStamp: 0 });
    act(() => {
      fireEvent.pointerMove(window, { pointerId: 5, clientX: 100, clientY: 700, timeStamp: 100 });
    });
    expect(drawer().hasAttribute("data-dragging")).toBe(false);
  });

  it("waits out a touch slop of 10 px before it takes the drag", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.pointerDown(box, { pointerId: 6, pointerType: "touch", button: 0, isPrimary: true, clientX: 100, clientY: 780, timeStamp: 0 });
    act(() => {
      fireEvent.pointerMove(window, { pointerId: 6, clientX: 100, clientY: 771, timeStamp: 30 });
    });
    expect(drawer().hasAttribute("data-dragging")).toBe(false);
    act(() => {
      fireEvent.pointerMove(window, { pointerId: 6, clientX: 100, clientY: 765, timeStamp: 60 });
    });
    expect(drawer().hasAttribute("data-dragging")).toBe(true);
  });

  it("leaves a sideways swipe on the head alone", () => {
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.pointerDown(box, { pointerId: 3, button: 0, isPrimary: true, clientX: 100, clientY: 780, timeStamp: 0 });
    act(() => {
      fireEvent.pointerMove(window, { pointerId: 3, clientX: 160, clientY: 775, timeStamp: 50 });
    });
    expect(drawer().hasAttribute("data-dragging")).toBe(false);
    expect(drawer().style.transform).toBe("");
  });

  it("gives a plain drawer a knob and nothing else", () => {
    render(<Harness head={false} />);
    expect(drawer().querySelector(".zr-pit-head")).toBeNull();
    expect(drawer().querySelector(".zr-pit-knob-bar")).toBeTruthy();
    expect(glyphs.fork).toBe("⑂");
  });
});
