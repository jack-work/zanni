import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer, Tray } from "zanni-react";

const items = [
  { key: "a", name: "IMG_0001.png", kind: "Photo", size: "1.2 MB", status: "ready" as const },
  { key: "b", name: "plan\u202E.pdf", kind: "PDF", size: "20 KB", status: "uploading" as const },
  { key: "c", name: "notes.txt", kind: "", size: "", status: "failed" as const, error: "attach a png, jpeg, gif, webp or heic image, or a pdf" },
];

describe("Tray", () => {
  it("draws nothing with no items", () => {
    const { container } = render(<Tray items={[]} onRemove={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("names each chip, its kind and size, its state, and the gateway's words when it failed", () => {
    render(<Tray items={items} onRemove={() => {}} />);
    const rows = document.querySelectorAll<HTMLElement>(".zr-tray-item");
    expect([...rows].map((r) => r.dataset.status)).toEqual(["ready", "uploading", "failed"]);
    expect(rows[0]!.querySelector(".zr-tray-meta")!.textContent).toBe("Photo 1.2 MB");
    expect(rows[0]!.querySelector(".zr-tray-mark")!.textContent).toBe("✓");
    expect(rows[1]!.querySelector(".nodi-ctl")).toBeTruthy();
    expect(rows[2]!.querySelector(".zr-tray-meta")!.textContent).toBe("attach a png, jpeg, gif, webp or heic image, or a pdf");
  });

  it("removes by key, without taking focus from the input", () => {
    const remove = vi.fn();
    render(<Tray items={items} onRemove={remove} />);
    const x = screen.getByRole("button", { name: "Remove IMG_0001.png" });
    expect(fireEvent.mouseDown(x)).toBe(false);
    fireEvent.click(x);
    expect(remove).toHaveBeenCalledWith("a");
  });

  it("sits above the input row in a Composer", () => {
    render(<Composer value="" onChange={() => {}} onSubmit={() => {}} sendLabel="Send" sendGlyph="✎" tray={<Tray items={items} onRemove={() => {}} />} />);
    const kids = [...document.querySelector("form")!.children].map((n) => n.className.split(" ")[0]);
    expect(kids.indexOf("zr-tray")).toBeLessThan(kids.indexOf("zr-compose-row"));
  });
});
