import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonGroup } from "zanni-react";

describe("Button", () => {
  it("wears the control scale, defaults to a plain outline button, and never submits unasked", () => {
    render(<Button>Go</Button>);
    const b = screen.getByRole("button", { name: "Go" });
    expect(b.className).toContain("z2-control");
    expect(b.getAttribute("data-size")).toBe("default");
    expect(b.getAttribute("data-variant")).toBe("outline");
    expect(b.getAttribute("type")).toBe("button");
  });

  it("takes size, variant, extra class, a ref and click handlers", () => {
    const click = vi.fn();
    render(
      <Button size="compact" variant="ghost" className="mine" onClick={click}>
        Small
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Small" });
    expect(b.className.split(" ")).toContain("mine");
    expect(b.getAttribute("data-size")).toBe("compact");
    fireEvent.click(b);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does not click when disabled", () => {
    const click = vi.fn();
    render(
      <Button disabled onClick={click}>
        Off
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(click).not.toHaveBeenCalled();
  });
});

describe("ButtonGroup", () => {
  it("is a labelled group", () => {
    render(
      <ButtonGroup label="Actions">
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole("group", { name: "Actions" }).querySelectorAll("button")).toHaveLength(2);
  });
});
