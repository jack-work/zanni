import { useEffect, useLayoutEffect } from "react";

declare global {
  interface Window {
    __figchat?: { firstFrame?: number };
  }
}

export const ATTACH_MARK = "figchat:attach";
export const FIRST_FRAME_MARK = "figchat:first-frame";

export function markAttach(): void {
  window.__figchat = {};
  performance.mark(ATTACH_MARK);
}

export function markFirstFrame(): () => void {
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(() => {
      performance.mark(FIRST_FRAME_MARK);
      window.__figchat = { firstFrame: performance.now() };
    });
  });
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}

export function useFirstFrame(attached: boolean): void {
  useLayoutEffect(markAttach, []);
  useEffect(() => (attached ? markFirstFrame() : undefined), [attached]);
}
