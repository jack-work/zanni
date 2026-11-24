import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FigaroSays, figaroHead, notHereLines } from "zanni-react";

const art = readFileSync(resolve(import.meta.dirname, "../../../assets/parla/figaro-head.png"));

describe("FigaroSays", () => {
  it("wears the shipped Figaro head, byte for byte, beside the line in a parla bubble", () => {
    render(<FigaroSays>If the boss says yes, you will get an email.</FigaroSays>);
    const head = screen.getByRole("img", { name: "Figaro" });
    expect(head.className).toBe("parla-head");
    expect(head.getAttribute("src")).toBe(figaroHead);
    expect(figaroHead.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(figaroHead.split(",")[1] ?? "", "base64").equals(art)).toBe(true);
    const bubble = screen.getByText("If the boss says yes, you will get an email.");
    expect(bubble.tagName).toBe("P");
    expect(bubble.className).toBe("parla-bubble");
    expect(bubble.parentElement?.className).toBe("parla");
    expect(bubble.hasAttribute("aria-live")).toBe(false);
  });

  it("the byte check notices a different picture", () => {
    const other = Buffer.from(art);
    other.writeUInt8(other.readUInt8(other.length - 1) ^ 1, other.length - 1);
    expect(Buffer.from(figaroHead.split(",")[1] ?? "", "base64").equals(other)).toBe(false);
  });

  it("takes a served head for a page whose policy refuses data: images, a class, and a live region", () => {
    render(
      <FigaroSays head="/static/figaro-head.png" className="mine" live>
        Request sent.
      </FigaroSays>,
    );
    expect(screen.getByRole("img", { name: "Figaro" }).getAttribute("src")).toBe("/static/figaro-head.png");
    const bubble = screen.getByText("Request sent.");
    expect(bubble.getAttribute("aria-live")).toBe("polite");
    expect(bubble.parentElement?.className.split(" ")).toEqual(["parla", "mine"]);
  });

  it("pops again when the words change and stays put when they do not", () => {
    const { rerender } = render(<FigaroSays>Hello.</FigaroSays>);
    const first = screen.getByText("Hello.");
    rerender(<FigaroSays>Hello.</FigaroSays>);
    expect(screen.getByText("Hello.")).toBe(first);
    rerender(<FigaroSays>Goodbye.</FigaroSays>);
    expect(screen.getByText("Goodbye.")).not.toBe(first);
  });

  it("says one of its lines on load, and a tap moves to the next, wrapping at the end", () => {
    const lines = ["One.", "Two.", "Three."];
    render(<FigaroSays lines={lines} start={2} />);
    const bubble = screen.getByRole("button", { name: "Three." });
    expect(bubble.className).toBe("parla-bubble parla-next");
    expect(bubble.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(bubble);
    fireEvent.click(screen.getByRole("button", { name: "One." }));
    expect(screen.getByRole("button", { name: "Two." })).toBeTruthy();
  });

  it("picks its first line at random when no start is given", () => {
    const lines = ["One.", "Two.", "Three."];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    render(<FigaroSays lines={lines} />);
    random.mockRestore();
    expect(screen.getByRole("button", { name: "Two." })).toBeTruthy();
  });

  it("ships twenty not-here remarks, each a short sentence that names nobody", () => {
    expect(notHereLines).toHaveLength(20);
    expect(new Set(notHereLines).size).toBe(20);
    for (const line of notHereLines) {
      expect(line.length).toBeLessThanOrEqual(140);
      expect(line).toMatch(/[.?!]$/);
      expect(line.toLowerCase()).not.toContain("gluck");
    }
    expect(notHereLines.some((l) => l.includes("the boss") || l.includes("The boss"))).toBe(true);
  });
});
