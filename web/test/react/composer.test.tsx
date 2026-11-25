import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { Button, Composer, KEYBOARD_CLOSE_SETTLE_MS, trackViewport } from "zanni-react";

function Harness({ submit = () => {}, running = false, onAttach = () => {}, onCommand = () => {}, commandOn = false }: { submit?: () => void; onAttach?: () => void; onCommand?: () => void; commandOn?: boolean; running?: boolean }) {
  const [v, setV] = useState("");
  return <Composer value={v} onChange={setV} onSubmit={submit} sendLabel={running ? "Steer" : "Send"} sendGlyph={running ? "↳" : "✎"} attach={{ glyph: "❝", label: "Attach", onClick: onAttach }} command={{ glyph: "∴", label: "Command", pressed: commandOn, onClick: onCommand }} running={running} accessory={<Button>Record</Button>} heightVar="--test-h" />;
}

const box = () => screen.getByLabelText("Message", { selector: "textarea" }) as HTMLTextAreaElement;

describe("Composer", () => {
  it("sends on Enter, breaks on Shift+Enter, and never during IME composition", () => {
    const submit = vi.fn();
    render(<Harness submit={submit} />);
    fireEvent.change(box(), { target: { value: "hi" } });
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("treats the Enter that Safari sends after an IME candidate as part of the composition", () => {
    const submit = vi.fn();
    render(<Harness submit={submit} />);
    fireEvent.keyDown(box(), { key: "Enter", keyCode: 229 });
    expect(submit).not.toHaveBeenCalled();
  });

  it("is a plain textarea with autocapitalize, autocorrect and spellcheck set on purpose", () => {
    render(<Harness />);
    expect(box().getAttribute("autocapitalize")).toBe("sentences");
    expect(box().getAttribute("autocorrect")).toBe("off");
    expect(box().getAttribute("spellcheck")).toBe("false");
    expect(document.querySelector("[contenteditable]")).toBeNull();
  });

  it("keeps focus in the box when a send tap started with the box focused, and does not steal it otherwise", () => {
    render(<Harness />);
    const send = screen.getByRole("button", { name: "Send" });
    box().focus();
    fireEvent.pointerDown(send);
    box().blur();
    fireEvent.click(send);
    expect(document.activeElement).toBe(box());
    box().blur();
    fireEvent.pointerDown(send);
    fireEvent.click(send);
    expect(document.activeElement).not.toBe(box());
  });

  it("refuses the mousedown on the send button, which would take focus from the box", () => {
    render(<Harness />);
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "Send" }))).toBe(false);
  });

  it("blurs a box the keyboard left behind once the close has settled, and not before", () => {
    vi.useFakeTimers();
    const vv = Object.assign(new EventTarget(), { height: 508, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    render(<Harness />);
    const stop = trackViewport();
    box().focus();
    vv.height = 844;
    act(() => {
      vv.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(KEYBOARD_CLOSE_SETTLE_MS - 10);
    });
    expect(document.activeElement).toBe(box());
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(document.activeElement).not.toBe(box());
    stop();
    vi.useRealTimers();
  });

  it("submits from the send button, which says Steer while running, and shows the accessory", () => {
    const submit = vi.fn();
    const { rerender } = render(<Harness submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(submit).toHaveBeenCalledTimes(1);
    rerender(<Harness submit={submit} running />);
    expect(screen.getByRole("button", { name: "Steer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
    expect(document.querySelector("form")!.hasAttribute("data-running")).toBe(true);
  });

  it("writes its height to a CSS variable and draws no strip", () => {
    render(<Harness running />);
    expect(document.querySelector(".zr-strip")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--test-h")).toMatch(/px$/);
  });
});

describe("the composer row", () => {
  it("draws attach on the left and command and send as one pair on the right, each a glyph pill with a name", () => {
    render(<Harness />);
    const row = document.querySelector(".zr-compose-row")!;
    expect(row.firstElementChild!.getAttribute("aria-label")).toBe("Attach");
    expect(row.firstElementChild!.textContent).toBe("❝");
    const pair = row.querySelector(".zr-pill-pair")!;
    expect([...pair.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Command", "Send"]);
    expect([...pair.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["∴", "✎"]);
    expect(pair.querySelector("button[type=submit]")).toBe(screen.getByRole("button", { name: "Send" }));
  });

  it("the send pill wears the steering glyph while running, and the command pill reports its state", () => {
    const onCommand = vi.fn();
    const { rerender } = render(<Harness running onCommand={onCommand} />);
    expect(screen.getByRole("button", { name: "Steer" }).textContent).toBe("↳");
    fireEvent.click(screen.getByRole("button", { name: "Command" }));
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Command" }).getAttribute("aria-pressed")).toBe("false");
    rerender(<Harness running commandOn />);
    expect(screen.getByRole("button", { name: "Command" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("an attach tap calls back and never submits", () => {
    const submit = vi.fn();
    const onAttach = vi.fn();
    render(<Harness submit={submit} onAttach={onAttach} />);
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
