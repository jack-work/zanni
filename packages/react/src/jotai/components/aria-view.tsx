import { Button, LatestPill, glyphs, scrollEdge, scrollRoot, useTranscriptScroll, watchScroll, Plain, TranscriptContext, TurnView } from "../../index";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ariaAtom } from "figaro-forms/aria/jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFirstFrame } from "../lib/first-frame";
import { labelOf } from "../lib/roster";
import { metricsLineAtom, noteAtom, seenAtom, turnsAtom } from "../state/aria";
import { forkOfAtom, pitSnapAtom, treeStateAtom } from "../state/pit";
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
import { CommandHelp } from "./command-help";
import { Pit } from "./pit";
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
  useAtomValue(seenAtom(client, aria));
  const [pane, setPane] = useAtom(paneAtom);
  const paneRef = useRef<HTMLElement | null>(null);
  const turnsRef = useRef<HTMLOListElement | null>(null);
  const olderRef = useRef<HTMLButtonElement | null>(null);
  const headRef = useRef<HTMLHeadingElement | null>(null);
  const loading = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pageError, setPageError] = useState("");
  const [followed, setFollowed] = useState(false);
  const [baseline, setBaseline] = useState<number | null>(null);
  const live = snap.phase === "live";
  const olderAvailable = snap.olderAvailable === true;
  const { spans, away, toEnd, latest, reveal } = useTranscriptScroll(turns, paneRef, followed);
  useFirstFrame(followed);

  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const speaking = useAtomValue(speakingAtom);
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
    setLoadingOlder(true);
    setPageError("");
    try {
      return await client.peek(aria).loadOlder();
    } catch (err) {
      setPageError("Could not load earlier turns: " + (err instanceof Error ? err.message : "network"));
      throw err;
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  }, [client, aria]);

  const seek = useCallback(
    async (turn: number) => {
      for (let n = 0; n <= DEEP_LIMIT; n++) {
        reveal(turn);
        const el = await appears(turn);
        if (el) {
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
      toEnd();
    },
    [client, aria, loadOlder, reveal, toEnd],
  );

  useEffect(() => {
    if (!live || followed) return;
    setFollowed(true);
    setBaseline(Math.max(-1, ...turns.map((t) => t.turn)));
    if (want) void seek(want);
    else toEnd();
  }, [live, followed, want, seek, toEnd, turns]);

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
      if (el.getBoundingClientRect().bottom > scrollEdge(root)) loadOlder().catch(() => {});
    };
    fill();
    const stop = watchScroll(root, fill);
    return stop;
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
  const pitClosed = useAtomValue(pitSnapAtom) === "closed";
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
            <ol ref={turnsRef} className="nodi-turns" aria-label="Transcript" data-held={turns.length}>
              {spans.flatMap(([from, to, gap], k) => [
                gap && <li key={"g" + k} data-slot={k} />,
                ...turns.slice(from, to).map((t) => <TurnView key={t.key} turn={t} speaking={speakingHere} fresh={baseline !== null && t.turn > baseline} />),
              ])}
            </ol>
          </TranscriptContext>
          {status && <p className="fw-note">{status}</p>}
        </main>
      </div>
      <Pit head={gone ? undefined : <Composer attended={attended} toBottom={toEnd} />} />
      {away && pitClosed && <LatestPill onClick={() => latest(turnsRef.current)} />}
      <CommandHelp />
    </section>
  );
}
