import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Spinner, reducedMotion, useMedia, useTick } from "zanni-react";

type Listener = () => void;

function fakeMedia(initial: Record<string, boolean>) {
  const state = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return !!state[query];
    },
    media: query,
    addEventListener: (_: string, fn: Listener) => (listeners.get(query) ?? listeners.set(query, new Set()).get(query)!).add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.get(query)?.delete(fn),
  })) as unknown as typeof window.matchMedia;
  return (query: string, on: boolean) => {
    state[query] = on;
    listeners.get(query)?.forEach((fn) => fn());
  };
}

const original = window.matchMedia;

afterEach(() => {
  window.matchMedia = original;
  vi.useRealTimers();
});

describe("useMedia", () => {
  it("reads the query and follows it as it changes", () => {
    const set = fakeMedia({ "(min-width: 900px)": false });
    function Probe() {
      return <p data-testid="p">{String(useMedia("(min-width: 900px)"))}</p>;
    }
    const { getByTestId, unmount } = render(<Probe />);
    expect(getByTestId("p").textContent).toBe("false");
    act(() => set("(min-width: 900px)", true));
    expect(getByTestId("p").textContent).toBe("true");
    unmount();
    expect(() => set("(min-width: 900px)", false)).not.toThrow();
  });
});

describe("reducedMotion", () => {
  it("is true when the query matches and when the browser cannot ask", () => {
    const set = fakeMedia({ "(prefers-reduced-motion: reduce)": false });
    expect(reducedMotion()).toBe(false);
    set("(prefers-reduced-motion: reduce)", true);
    expect(reducedMotion()).toBe(true);
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(reducedMotion()).toBe(true);
  });
});

describe("useTick", () => {
  it("reads the clock again each period and stops when the period is null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const seen: number[] = [];
    function Probe({ period }: { period: number | null }) {
      seen.push(useTick(period));
      return null;
    }
    const { rerender } = render(<Probe period={250} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(seen[seen.length - 1]).toBe(1_500);
    rerender(<Probe period={null} />);
    const count = seen.length;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seen.length).toBe(count);
  });
});

describe("Spinner", () => {
  it("cycles its frames, and holds the first one under reduced motion", () => {
    vi.useFakeTimers();
    fakeMedia({ "(prefers-reduced-motion: reduce)": false });
    const moving = render(<Spinner />);
    const first = moving.container.textContent;
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(moving.container.textContent).not.toBe(first);
    moving.unmount();
    fakeMedia({ "(prefers-reduced-motion: reduce)": true });
    const still = render(<Spinner />);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(still.container.textContent).toBe(first);
  });
});
