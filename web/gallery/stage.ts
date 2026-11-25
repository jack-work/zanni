import type { ReactNode } from "react";
import type { createStore } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import type { Dial } from "figaro-forms";
import { bootAtom, routeFor } from "zanni-react/jotai";

export type Frame = "phone" | "tablet" | "desktop";

export const FRAMES: Record<Frame, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
};

export const STORE = "gallery";

export interface MockCore {
  ids: Record<"main" | "lane" | "spain" | "engineer" | "forms", string>;
  dial: Dial;
  calls: { method: string; params: Record<string, unknown> }[];
  setQueue(aria: string, root: unknown): void;
  setOrders(root: unknown): void;
  running(id: string): boolean;
}

export interface MockOptions {
  now?: () => number;
  step?: number;
  history?: number;
  pageBytes?: number;
  timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
}

export interface AriaMock {
  create(options: MockOptions): MockCore;
}

export type Store = ReturnType<typeof createStore>;

export interface Scene {
  readonly name: string;
  readonly frame: Frame;
  readonly note?: string;
  readonly mock?: { history?: number; steps?: number; step?: number };
  readonly signedOut?: boolean;
  setup?(core: MockCore, store: Store): void | Promise<void>;
  after?(core: MockCore, store: Store, root: HTMLElement): void | Promise<void>;
  render?(core: MockCore, store: Store): ReactNode;
}

export function clientOf(store: Store): AriaClient {
  const client = store.get(bootAtom).stores[STORE];
  if (!client) throw new Error("the gallery has no client");
  return client;
}

export function go(aria?: string, turn?: number): void {
  window.location.hash = routeFor(STORE, aria, turn);
}
