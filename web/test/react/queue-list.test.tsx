import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueueList, type QueueListRow } from "zanni-react";

const rows: QueueListRow[] = [
  { id: 3, text: "first line\nsecond line", mark: "·" },
  { id: 4, text: "other", mark: "→" },
];

afterEach(() => vi.useRealTimers());

describe("QueueList", () => {
  it("says the queue is empty when there are no rows", () => {
    render(<QueueList rows={[]} onDrop={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText("message queue is empty")).toBeTruthy();
  });

  it("draws the mark and the first line, and opens a row to its whole text", () => {
    render(<QueueList rows={rows} onDrop={vi.fn()} onEdit={vi.fn()} />);
    const first = document.querySelector<HTMLElement>(".zr-pit-row[data-id='3']")!;
    expect(first.textContent).toContain("·");
    expect(first.textContent).toContain("first line");
    expect(first.textContent).not.toContain("second line");
    expect(document.querySelector(".zr-queue-text")).toBeNull();
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".zr-queue-text")!.textContent).toBe("first line\nsecond line");
    expect(screen.queryByText("message queue is empty")).toBeNull();
  });

  it("drops the opened row by id", async () => {
    const onDrop = vi.fn(async () => undefined);
    render(<QueueList rows={rows} onDrop={onDrop} onEdit={vi.fn()} />);
    fireEvent.click(document.querySelector(".zr-pit-row[data-id='4']")!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Drop" }));
    });
    expect(onDrop).toHaveBeenCalledWith(4);
  });

  it("shows the daemon's refusal on the bar line and keeps the row", async () => {
    const onDrop = vi.fn(async () => "queue rm 4: committing");
    render(<QueueList rows={rows} onDrop={onDrop} onEdit={vi.fn()} />);
    fireEvent.click(document.querySelector(".zr-pit-row[data-id='4']")!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Drop" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("queue rm 4: committing");
    expect(document.querySelector(".zr-pit-row[data-id='4']")).toBeTruthy();
  });

  it("edits the text, refuses an empty or unchanged save, and closes the editor once saved", async () => {
    const onEdit = vi.fn(async () => undefined);
    render(<QueueList rows={rows} onDrop={vi.fn()} onEdit={onEdit} />);
    fireEvent.click(document.querySelector(".zr-pit-row[data-id='4']")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Queued message" }) as HTMLTextAreaElement;
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(box.value).toBe("other");
    expect(save.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  " } });
    expect(save.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "changed" } });
    expect(save.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(save);
    });
    expect(onEdit).toHaveBeenCalledWith(4, "changed");
    expect(screen.queryByRole("textbox", { name: "Queued message" })).toBeNull();
  });

  it("keeps the editor open and says why when the edit is rejected", async () => {
    render(<QueueList rows={rows} onDrop={vi.fn()} onEdit={vi.fn(async () => "queue edit 4: stale (epoch moved)")} />);
    fireEvent.click(document.querySelector(".zr-pit-row[data-id='4']")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Queued message" }), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("queue edit 4: stale (epoch moved)");
    expect(screen.getByRole("textbox", { name: "Queued message" })).toBeTruthy();
  });

  it("holds an arrival back for the grace and shows rows already there at once", () => {
    vi.useFakeTimers();
    const view = render(<QueueList rows={rows.slice(0, 1)} grace={150} onDrop={vi.fn()} onEdit={vi.fn()} />);
    expect(document.querySelectorAll(".zr-pit-row").length).toBe(1);
    view.rerender(<QueueList rows={rows} grace={150} onDrop={vi.fn()} onEdit={vi.fn()} />);
    expect(document.querySelectorAll(".zr-pit-row").length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(document.querySelectorAll(".zr-pit-row").length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(document.querySelectorAll(".zr-pit-row").length).toBe(2);
  });

  it("draws an arrival at once while the aria is running", () => {
    const view = render(<QueueList rows={[]} grace={0} onDrop={vi.fn()} onEdit={vi.fn()} />);
    view.rerender(<QueueList rows={rows} grace={0} onDrop={vi.fn()} onEdit={vi.fn()} />);
    expect(document.querySelectorAll(".zr-pit-row").length).toBe(2);
  });
});
