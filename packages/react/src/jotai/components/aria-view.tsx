import { Button, LatestPill, glyphs, scrollRoot, scrollToBottom, useFollow, useTurnWindow, Plain, TranscriptContext, TurnView } from "../../index";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ariaAtom } from "figaro-forms/aria/jotai";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFirstFrame } from "../lib/first-frame";
import { labelOf } from "../lib/roster";
import { metricsLineAtom, noteAtom, startedAtom, turnsAtom } from "../state/aria";
import { forkOfAtom, treeStateAtom } from "../state/pit";
import { paneAtom } from "../state/pane";
import { routeFor } from "../lib/route";
import { rosterAtom } from "../state/roster";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { speakingAtom } from "../state/audio";
import { micCancelAtom } from "../state/mic";
import { useVoice } from "./use-voice";
import { linkAtom } from "../state/aria";
import type { Attended } from "../state/route";
import { Composer } from "./composer";
import { InlineActions } from "./inline-actions";
import { TurnActions } from "./turn-actions";

const DEEP_LIMIT = 60;
const FLASH_MS = 1800;

const turnEl = (turn: number): HTMLElement | null => document.querySelector<HTMLElement>('.nodi-turn[data-turn="' + turn + '"]');
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function appears(turn: number): Promise<HTMLElement | null> {
  for (let i = 0; i < 24; i++) {
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
  useAtomValue(startedAtom(client, aria));
  const [pane, setPane] = useAtom(paneAtom);
  const paneRef = useRef<HTMLElement | null>(null);
  const olderRef = useRef<HTMLButtonElement | null>(null);
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const anchor = useRef<{ turn: number; top: number } | null>(null);
  const loading = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pageError, setPageError] = useState("");
  const [followed, setFollowed] = useState(false);
  const [baseline, setBaseline] = useState<number | null>(null);
  const live = snap.phase === "live";
  const olderAvailable = snap.olderAvailable === true;
  const follow = useFollow(paneRef, followed);
  useFirstFrame(followed);
  const paging = follow.paging;
  const toBottom = follow.toBottom;

  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const speaking = useAtomValue(speakingAtom);
  const [spans, jump] = useTurnWindow(turns);
  useLayoutEffect(() => {
    if (followed) follow.snap();
  }, [turns, followed, follow.snap]);
  const cancelMic = useSetAtom(micCancelAtom);
  useVoice(attended);
  useEffect(() => () => cancelMic(), [cancelMic]);
  const speakingHere = speaking && speaking.aria === aria ? speaking : null;
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
    if (delta) scrollRoot().scrollTop += delta;
    anchor.current = null;
  }, [firstKey]);

  const seek = useCallback(
    async (turn: number) => {
      for (let n = 0; n <= DEEP_LIMIT; n++) {
        jump(turn);
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
    setBaseline(Math.max(-1, ...turns.map((t) => t.turn)));
    if (want) void seek(want);
    else toBottom();
  }, [live, followed, want, seek, toBottom, turns]);

  const wanted = useRef(want);
  useEffect(() => {
    if (want && want !== wanted.current && followed) void seek(want);
    wanted.current = want;
  }, [want, followed, seek]);

  useEffect(() => {
    const el = olderRef.current;
    if (!el || !followed || loadingOlder || pageError) return;
    const root = scrollRoot();
    const fill = () => {
      if (el.getBoundingClientRect().bottom > root.getBoundingClientRect().top) loadOlder().catch(() => {});
    };
    fill();
    root.addEventListener("scroll", fill, { passive: true });
    return () => root.removeEventListener("scroll", fill);
  }, [followed, olderAvailable, loadOlder, loadingOlder, pageError]);

  const tree = useAtomValue(treeStateAtom);
  const transcript = useMemo(
    () => ({
      actions: (turn: number, playable: boolean, inquiry: boolean) => <TurnActions turn={turn} playable={playable} inquiry={inquiry} />,
      below: (kind: "input" | "prose", turn: number) => <InlineActions kind={kind} turn={turn} />,
      nameOf: (id: string) => tree?.nodes.get(id)?.handle ?? id.slice(0, 8),
    }),
    [tree],
  );
  const gone = link === "gone" || link === "refused";
  const fork_of = useAtomValue(forkOfAtom);
  const status = note || pageError;
  const metrics = useAtomValue(metricsLineAtom(client, aria));

  return (
    <section className="fw-pane-inner">
      <div className="fw-scroll zr-scroll" data-zr-scroll="" data-testid="transcript-scroller">
        <main className="fw-main" tabIndex={-1} ref={paneRef}>
          <div className="fw-subbar">
            <a className="fw-back" href="#/">
              Arias
            </a>
            {fork_of && (
              <a className="fw-forkmark" href={routeFor(attended.store, fork_of.id)} title="The aria this one was forked from">
                {glyphs.fork + " Fork of " + fork_of.name}
              </a>
            )}
            <Button variant="quiet" size="compact" className="fw-panes" aria-controls="fw-arias" aria-expanded={pane.open} onClick={() => setPane({ open: !pane.open })}>
              Arias
            </Button>
            {!gone && (
            <div className="fw-subtools">
              <Button variant="quiet" size="compact" className="fw-fork" disabled={link !== "live" || forking} onClick={() => void fork(0)}>
                Fork
              </Button>
            </div>
            )}
          </div>
          <h1 className="fw-h1" tabIndex={-1} ref={headRef}>
            <Plain text={heading} />
          </h1>
          <div className="fw-metrics">{metrics && <p className="nodi-metrics">{metrics}</p>}</div>
          {olderAvailable && (
            <Button variant="quiet" size="compact" className="fw-older" ref={olderRef} disabled={loadingOlder} onClick={() => loadOlder().catch(() => {})}>
              Earlier turns
            </Button>
          )}
          <TranscriptContext value={transcript}>
            <ol className="nodi-turns" aria-label="Transcript" data-held={turns.length}>
              {spans.flatMap(([from, to, gap], k) => [
                gap && <li key={"g" + k} data-slot={k} />,
                ...turns.slice(from, to).map((t) => <TurnView key={t.key} turn={t} speaking={speakingHere} fresh={baseline !== null && t.turn > baseline} />),
              ])}
            </ol>
          </TranscriptContext>
          {status && <p className="fw-note">{status}</p>}
        </main>
      </div>
      {!gone && <Composer attended={attended} toBottom={toBottom} />}
      {follow.away && <LatestPill onClick={toBottom} />}
    </section>
  );
}
