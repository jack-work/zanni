import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Composer, Hints } from "zanni-react";

describe("Hints", () => {
  it("draws nothing when there is nothing to say", () => {
    const { container } = render(<Hints chips={[]} onPick={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("offers chips that pick without taking focus, marks the ones that cannot run, and boxes server text", () => {
    const pick = vi.fn();
    render(<Hints chips={[{ key: "fork", label: "fork", help: "Fork an aria" }, { key: "kill", label: "kill", off: "the door refuses it" }, { key: "x", label: "a\u202Eb" }]} onPick={pick} usage="fork [id]" help="Fork an aria" />);
    const chips = document.querySelectorAll<HTMLElement>(".zr-chip");
    expect(chips).toHaveLength(3);
    expect(chips[1]!.hasAttribute("data-off")).toBe(true);
    expect(chips[1]!.title).toBe("the door refuses it");
    expect(chips[2]!.querySelector(".nodi-ctl")).toBeTruthy();
    expect(fireEvent.mouseDown(chips[0]!)).toBe(false);
    fireEvent.click(chips[1]!);
    expect(pick).toHaveBeenCalledWith("kill");
    expect(document.querySelector(".zr-hint-usage")!.textContent).toBe("fork [id]");
  });

  it("puts a refusal in place of the usage", () => {
    render(<Hints chips={[]} onPick={() => {}} usage="kill" refusal="kill: not here" />);
    expect(document.querySelector(".zr-hint[data-refused]")!.textContent).toBe("kill: not here");
    expect(document.querySelector(".zr-hint-usage")).toBeNull();
  });
});

function Harness({ submit, escape, tab, coarse = false }: { submit: () => void; escape?: () => void; tab?: () => void; coarse?: boolean }) {
  const [v, setV] = useState("fork 3");
  if (coarse) window.matchMedia = ((q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  return <Composer value={v} onChange={setV} onSubmit={submit} sendLabel="Run" sendGlyph="✎" prompt=":" enterRuns hints={<p className="mine">hints</p>} onEscape={escape} onTab={tab} />;
}

describe("Composer in command mode", () => {
  it("shows the prompt and the hints above the row, and lays the row out for them", () => {
    render(<Harness submit={() => {}} />);
    expect(document.querySelector(".zr-prompt")!.textContent).toBe(":");
    expect(document.querySelector(".zr-compose-row")!.hasAttribute("data-prompt")).toBe(true);
    const form = document.querySelector("form")!;
    expect([...form.children].map((n) => n.className.split(" ")[0])).toEqual(["mine", "zr-compose-row"]);
  });

  it("runs on Enter, leaves on Escape, completes on Tab, and does not take Shift+Tab", () => {
    const submit = vi.fn();
    const escape = vi.fn();
    const tab = vi.fn();
    render(<Harness submit={submit} escape={escape} tab={tab} />);
    const box = screen.getByRole("textbox");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(submit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(escape).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(box, { key: "Tab" })).toBe(false);
    expect(tab).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(box, { key: "Tab", shiftKey: true })).toBe(true);
    expect(tab).toHaveBeenCalledTimes(1);
  });

  it("runs on Enter even on a coarse pointer, where a message would break the line", () => {
    const submit = vi.fn();
    const original = window.matchMedia;
    render(<Harness submit={submit} coarse />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox").getAttribute("enterkeyhint")).toBe("send");
    window.matchMedia = original;
  });

  it("ignores Escape and Tab when no handler is given", () => {
    render(<Composer value="" onChange={() => {}} onSubmit={() => {}} sendLabel="Send" sendGlyph="✎" />);
    const box = screen.getByRole("textbox");
    expect(fireEvent.keyDown(box, { key: "Escape" })).toBe(true);
    expect(fireEvent.keyDown(box, { key: "Tab" })).toBe(true);
    expect(document.querySelector(".zr-prompt")).toBeNull();
  });
});
