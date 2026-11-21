import { useAtomValue, useSetAtom } from "jotai";
import { ariaAtom } from "figaro-forms/aria/jotai";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { scrollToBottom, useFollow } from "../lib/follow";
import { labelOf } from "../lib/roster";
import { nodi } from "../lib/zanni";
import { noteAtom, turnsAtom } from "../state/aria";
import { rosterAtom } from "../state/roster";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { linkAtom } from "../state/aria";
import type { Attended } from "../state/route";
import { Composer } from "./composer";
import { TurnView } from "./items";
import { Plain } from "./text";

const DEEP_LIMIT = 60;
const FLASH_MS = 1800;

const turnEl = (turn: number): HTMLElement | null => document.querySelector<HTMLElement>('.nodi-turn[data-turn="' + turn + '"]');
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function appears(turn: number): Promise<HTMLElement | null> {
  for (let i = 0; i < 12; i++) {
    const el = turnEl(turn);
    if (el) return el;
    await pause(25);
  }
  return null;
}

export function AriaView({ attended }: { attended: Attended }) {
  const { client, aria, turn: want } = attended;
  const snap = useAtomValue(ariaAtom(client, aria));
  const turns = useAtomValue(turnsAtom(client, aria));
  const note = useAtomValue(noteAtom(client, aria));
  const roster = useAtomValue(rosterAtom);
  const paneRef = useRef<HTMLElement | null>(null);
  const olderRef = useRef<HTMLButtonElement | null>(null);
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const anchor = useRef<{ turn: number; top: number } | null>(null);
  const loading = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pageError, setPageError] = useState("");
  const [followed, setFollowed] = useState(false);
  const live = snap.phase === "live";
  const olderAvailable = snap.olderAvailable === true;
  const follow = useFollow(paneRef, followed);
  const paging = follow.paging;
  const toBottom = follow.toBottom;

  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const forking = useAtomValue(composerAtom(keyOf(attended.store, aria))).forking;
  const row = roster.rows.find((r) => r.id === aria);
  const heading = row ? labelOf(row) : aria.slice(0, 8);

  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
  }, []);

  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (loading.current) return false;
    loading.current = true;
    paging.current = true;
    setLoadingOlder(true);
    setPageError("");
    const first = document.querySelector<HTMLElement>(".nodi-turn");
    anchor.current = first ? { turn: Number(first.dataset.turn), top: first.getBoundingClientRect().top } : null;
    try {
      return await client.peek(aria).loadOlder();
    } catch (err) {
      setPageError("Could not load earlier turns: " + (err instanceof Error ? err.message : "network"));
      throw err;
    } finally {
      loading.current = false;
      setLoadingOlder(false);
      setTimeout(() => {
        anchor.current = null;
        paging.current = false;
      }, 400);
    }
  }, [client, aria, paging]);

  const firstKey = turns[0]?.key;
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    const el = turnEl(a.turn);
    if (!el) return;
    const delta = el.getBoundingClientRect().top - a.top;
    if (delta) window.scrollBy(0, delta);
    anchor.current = null;
  }, [firstKey]);

  const seek = useCallback(
    async (turn: number) => {
      for (let n = 0; n <= DEEP_LIMIT; n++) {
        const el = await appears(turn);
        if (el) {
          el.scrollIntoView();
          el.setAttribute("data-flash", "");
          setTimeout(() => el.removeAttribute("data-flash"), FLASH_MS);
          return;
        }
        if (client.peek(aria).snapshot().olderAvailable !== true) break;
        try {
          await loadOlder();
        } catch {
          break;
        }
      }
      scrollToBottom();
    },
    [client, aria, loadOlder],
  );

  useEffect(() => {
    if (!live || followed) return;
    setFollowed(true);
    if (want) void seek(want);
    else toBottom();
  }, [live, followed, want, seek, toBottom]);

  const wanted = useRef(want);
  useEffect(() => {
    if (want && want !== wanted.current && followed) void seek(want);
    wanted.current = want;
  }, [want, followed, seek]);

  useEffect(() => {
    const el = olderRef.current;
    if (!el || !followed || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadOlder().catch(() => {});
      },
      { rootMargin: "300px 0px 0px 0px" },
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [followed, olderAvailable, loadOlder]);

  const status = note || pageError;
  const metrics = snap.metrics ? nodi.metricsLine(snap.metrics) : "";

  return (
    <section className="fw-pane-inner" ref={paneRef}>
      <main className="fw-main" tabIndex={-1}>
        <a className="fw-back" href="#/">
          Arias
        </a>
        <div className="fw-head-row">
          <h1 className="fw-h1" tabIndex={-1} ref={headRef}>
            <Plain text={heading} />
          </h1>
          <button type="button" className="fw-fork" disabled={link !== "live" || forking} onClick={() => void fork(0)}>
            Fork
          </button>
        </div>
        <div className="fw-metrics">{metrics && <p className="nodi-metrics">{metrics}</p>}</div>
        {olderAvailable && (
          <button type="button" className="fw-older" ref={olderRef} disabled={loadingOlder} onClick={() => loadOlder().catch(() => {})}>
            Earlier turns
          </button>
        )}
        <ol className="nodi-turns" aria-label="Transcript">
          {turns.map((t) => (
            <TurnView key={t.key} turn={t} speaking={null} />
          ))}
        </ol>
        {status && <p className="fw-note">{status}</p>}
      </main>
      <Composer attended={attended} toBottom={toBottom} />
      {follow.unseen && (
        <button type="button" className="fw-latest" onClick={toBottom}>
          Latest
        </button>
      )}
    </section>
  );
}
