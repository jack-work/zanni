import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, Composer, Strip } from "zanni-react";

function Harness({ submit = () => {}, running = false, strip = null }: { submit?: () => void; running?: boolean; strip?: { kind: "running" | "note"; text: string; time?: string } | null }) {
  const [v, setV] = useState("");
  return <Composer value={v} onChange={setV} onSubmit={submit} sendLabel={running ? "Steer" : "Send"} running={running} strip={strip} stripActions={<Button>Stop</Button>} accessory={<Button>Record</Button>} heightVar="--test-h" />;
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

  it("draws the strip only when given one, with its actions for a running turn", () => {
    const { rerender } = render(<Harness />);
    expect(document.querySelector(".zr-strip")).toBeNull();
    rerender(<Harness running strip={{ kind: "running", text: "Running go test", time: "0:12" }} />);
    expect(document.querySelector(".zr-strip-text")!.textContent).toBe("Running go test");
    expect(document.querySelector(".zr-strip-time")!.textContent).toBe("0:12");
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue("--test-h")).toMatch(/px$/);
  });
});

describe("Strip", () => {
  it("a note strip has no glyph and no time", () => {
    render(<Strip kind="note" text="Transcribing." />);
    expect(document.querySelector(".zr-glyph")).toBeNull();
    expect(document.querySelector(".zr-strip-time")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Transcribing.");
  });
});
