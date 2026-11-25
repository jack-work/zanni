import { Button, Pit as ZPit, PitList, PitRow, glyphs } from "../../index";
import type { ReactNode } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { PIT_ROWS, EFFORT_KEY, FORKED_FROM_KEY, byLastUsed, valueAt, type PitRowId, type PitView } from "../lib/pit-rows";
import { PHASE_WORDS, labelOf } from "../lib/roster";
import { AsksView, useAsks } from "./asks";
import { ControlStatus } from "./control-status";
import { OlderArias } from "./older";
import { QueueView } from "./queue-view";
import { TopologyTree, FormTree } from "./tree-view";
import { FormEdit, type FormEditTarget } from "./form-edit";
import { attendedRunningAtom, turnsAtom, linkAtom } from "../state/aria";
import { handsFreeAtom, toggleHandsFreeAtom, toggleVoiceAtom, voiceAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { openNewFigaroAtom } from "../state/new-figaro";
import { attendedFactsAtom, boundStateAtom, markPitUsedAtom, pitSnapAtom, pitUsedAtom, pitViewAtom, queueStateAtom, recentStateAtom, treeStateAtom } from "../state/pit";
import { attendedRowAtom, rosterAtom } from "../state/roster";
import { attendedAtom, clientAtom, goAtom, storeNameAtom } from "../state/route";

const TITLES: Record<PitView, string> = {
  list: "",
  state: "State",
  "fork-at": "Fork at turn",
  tree: "Tree",
  recent: "Recent",
  asks: "Asks",
  queue: "Queue",
  outfits: "Outfits",
};

const FACE: Record<PitView, string> = {
  list: glyphs["pit.form"],
  state: glyphs["pit.form"],
  "fork-at": glyphs.fork,
  tree: glyphs["pit.troupe"],
  recent: glyphs["pit.form"],
  asks: glyphs["pit.form"],
  queue: glyphs["pit.queue"],
  outfits: glyphs["pit.models"],
};

export function Pit({ head }: { head?: ReactNode }) {
  const [snap, setSnap] = useAtom(pitSnapAtom);
  const [view, setView] = useAtom(pitViewAtom);
  const { mark } = useAtomValue(bootAtom);
  const attended = useAtomValue(attendedAtom);
  const own = useAtomValue(attendedFactsAtom);
  const closed = snap === "closed";
  useEffect(() => {
    if (closed) setView("list");
  }, [closed, setView]);
  const name = attended ? own?.mantra || attended.aria.slice(0, 8) : "figaro web";
  return (
    <ZPit className="fw-pit" label="Controls" snap={snap} onSnapChange={setSnap} head={head}>
      <p className="fw-pit-title">
        {snap === "full" && mark ? <img className="fw-head" alt="" src={mark} /> : <span className="fw-pit-glyph" aria-hidden="true">{FACE[view]}</span>}
        {view === "list" ? name : TITLES[view]}
      </p>
      {view !== "list" && (
        <PitList>
          <PitRow glyph="‹" label={name} className="fw-pit-back" onClick={() => setView("list")} />
        </PitList>
      )}
      {view === "list" && attended && <ControlStatus attended={attended} />}
      {view === "list" && <ControlList />}
      {view === "state" && <StateView />}
      {view === "fork-at" && <ForkAtView />}
      {view === "tree" && <TreeView />}
      {view === "recent" && <RecentView />}
      {view === "asks" && <AsksView />}
      {view === "queue" && <QueueView />}
      {view === "outfits" && <OutfitsView />}
    </ZPit>
  );
}

function ControlList() {
  const setSnap = useSetAtom(pitSnapAtom);
  const setView = useSetAtom(pitViewAtom);
  const used = useAtomValue(pitUsedAtom);
  const markUsed = useSetAtom(markPitUsedAtom);
  const attended = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  const forking = useAtomValue(composerAtom(attended ? keyOf(attended.store, attended.aria) : "")).forking;
  const bound = useAtomValue(boundStateAtom);
  const tree = useAtomValue(treeStateAtom);
  const recent = useAtomValue(recentStateAtom);
  const queue = useAtomValue(queueStateAtom);
  const row = useAtomValue(attendedRowAtom);
  const asks = useAsks();
  const voice = useAtomValue(voiceAtom);
  const toggleVoice = useSetAtom(toggleVoiceAtom);
  const handsFree = useAtomValue(handsFreeAtom);
  const toggleHandsFree = useSetAtom(toggleHandsFreeAtom);
  const openNew = useSetAtom(openNewFigaroAtom);
  const fork = useSetAtom(forkAtom);
  const live = link === "live";

  const meta: Partial<Record<PitRowId, string>> = {
    state: valueAt(bound?.root, EFFORT_KEY) ?? "",
    tree: tree?.nodes.size ? String(tree.nodes.size) : "",
    recent: recent?.rows.length ? String(recent.rows.length) : "",
    asks: asks.asks.length ? String(asks.asks.length) : "",
    queue: queue?.rows.length ? String(queue.rows.length) : "",
    outfits: row?.outfit_name ?? "",
    voice: voice ? "on" : "off",
    "hands-free": handsFree ? "on" : "off",
  };
  const act: Record<PitRowId, () => void> = {
    new: () => {
      setSnap("closed");
      openNew();
    },
    state: () => setView("state"),
    "tail-fork": () => {
      setSnap("closed");
      void fork(0);
    },
    "fork-at": () => setView("fork-at"),
    tree: () => setView("tree"),
    recent: () => setView("recent"),
    asks: () => setView("asks"),
    queue: () => setView("queue"),
    outfits: () => setView("outfits"),
    voice: () => toggleVoice(),
    "hands-free": () => toggleHandsFree(),
  };
  const off = (id: PitRowId): boolean => (id === "tail-fork" ? !attended || !live || forking : id === "state" || id === "fork-at" || id === "outfits" || id === "queue" || id === "hands-free" ? !attended : false);

  const sorted = byLastUsed(PIT_ROWS, used);
  const draw = (r: (typeof PIT_ROWS)[number]) => (
    <PitRow
      key={r.id}
      glyph={r.tile ? "" : r.glyph}
      label={r.tile ?? r.label}
      meta={r.tile ? undefined : meta[r.id]}
      action={r.id}
      className={r.id === "voice" ? "fw-voice" : r.id === "hands-free" ? "fw-hands" : "fw-pit-act"}
      pressed={r.id === "voice" ? voice : r.id === "hands-free" ? handsFree : undefined}
      disabled={off(r.id)}
      onClick={() => {
        markUsed(r.id);
        act[r.id]();
      }}
    />
  );
  return (
    <>
      <PitList label="Controls" className="fw-controls">
        {sorted.filter((r) => r.tile).map(draw)}
      </PitList>
      <PitList label="Details">{sorted.filter((r) => !r.tile).map(draw)}</PitList>
    </>
  );
}

function StateView() {
  const [editing, setEditing] = useState<FormEditTarget | undefined>(undefined);
  const link = useAtomValue(linkAtom);
  const store = useAtomValue(storeNameAtom);
  const attended = useAtomValue(attendedAtom);
  const own = useAtomValue(attendedFactsAtom);
  const bound = useAtomValue(boundStateAtom);
  const word = PHASE_WORDS[link] ?? "";
  const effort = valueAt(bound?.root, EFFORT_KEY);
  const from = valueAt(bound?.root, FORKED_FROM_KEY);
  const mantra = own?.mantra ?? valueAt(bound?.root, "mantra");
  const facts: [string, string, string?][] = [["Link", word], ["Store", store]];
  if (attended) facts.push(["Aria", attended.aria]);
  if (mantra) facts.push(["Mantra", mantra]);
  if (from) facts.push(["Fork of", from]);
  facts.push(["Effort", effort ?? (bound?.ready ? "unset" : "…"), EFFORT_KEY]);
  return (
    <>
      <dl className="fw-pit-state">
        {facts.map(([k, v, key]) => (
          <div key={k} className="fw-pit-fact" data-key={key}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {attended && !editing && <FormTree root={bound?.root} autoFocus onEdit={(path) => setEditing({ path })} />}
      {attended && editing && <FormEdit attended={attended} root={bound?.root} target={editing} onDone={() => setEditing(undefined)} />}
      {bound?.error ? (
        <p className="fw-note">{"State is not available: " + bound.error}</p>
      ) : (
        attended &&
        !editing && (
          <div className="fw-new-actions">
            <p className="fw-note">Tap a value, or c on it, to change it.</p>
            <Button variant="quiet" onClick={() => setEditing({ path: "", fresh: true })}>
              Set a key
            </Button>
          </div>
        )
      )}
    </>
  );
}

function ForkAtView() {
  const setSnap = useSetAtom(pitSnapAtom);
  const attended = useAtomValue(attendedAtom)!;
  const turns = useAtomValue(turnsAtom(attended.client, attended.aria));
  const link = useAtomValue(linkAtom);
  const forking = useAtomValue(composerAtom(keyOf(attended.store, attended.aria))).forking;
  const fork = useSetAtom(forkAtom);
  const last = Math.max(1, ...turns.map((t) => t.turn));
  const [turn, setTurn] = useState(String(last));
  const [text, setText] = useState("");
  const n = Number.parseInt(turn, 10);
  const ok = Number.isInteger(n) && n >= 1 && n <= last;
  return (
    <form
      className="fw-new-form fw-forkat-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!ok) return;
        setSnap("closed");
        void fork({ turn: n, ...(text.trim() ? { text: text.trim() } : {}) });
      }}
    >
      <label className="fw-field">
        <span className="fw-field-label">Turn</span>
        <input data-autofocus inputMode="numeric" pattern="[0-9]*" value={turn} onChange={(e) => setTurn(e.target.value)} aria-invalid={!ok} />
      </label>
      <label className="fw-field">
        <span className="fw-field-label">First message</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="optional" />
      </label>
      <div className="fw-new-actions">
        <Button type="submit" variant="accent" disabled={!ok || link !== "live" || forking}>
          Fork at {ok ? n : "turn"}
        </Button>
      </div>
    </form>
  );
}

function TreeView() {
  const setSnap = useSetAtom(pitSnapAtom);
  return <TopologyTree autoFocus onVisit={() => setSnap("closed")} />;
}

function RecentView() {
  const setSnap = useSetAtom(pitSnapAtom);
  const recent = useAtomValue(recentStateAtom);
  const attended = useAtomValue(attendedAtom);
  const store = useAtomValue(storeNameAtom);
  const go = useSetAtom(goAtom);
  const rows = useAtomValue(rosterAtom).rows;
  if (!recent) return <p className="fw-note">No store.</p>;
  return (
    <>
      {!recent.ready && recent.rows.length === 0 && <p className="fw-note">{recent.error ? "No recent list: " + recent.error : "Loading"}</p>}
      <PitList label="Recent">
        {recent.rows.map((r) => (
          <PitRow
            key={r.id}
            id={r.id}
            glyph={r.state === "active" ? glyphs["state.here"] : glyphs["state.idle"]}
            label={r.title || labelOf(rows.find((x) => x.id === r.id))}
            meta={r.state}
            current={attended?.aria === r.id}
            onClick={() => {
              setSnap("closed");
              go({ store, aria: r.id });
            }}
          />
        ))}
      </PitList>
      <OlderArias shown={new Set(recent.rows.map((r) => r.id))} more={recent.more} onVisit={() => setSnap("closed")} />
    </>
  );
}

interface OutfitsReply {
  default?: string;
  names?: string[];
  outfits?: { name: string; path?: string; origin?: string }[];
}

function OutfitsView() {
  const setSnap = useSetAtom(pitSnapAtom);
  const client = useAtomValue(clientAtom);
  const row = useAtomValue(attendedRowAtom);
  const bound = useAtomValue(boundStateAtom);
  const openNew = useSetAtom(openNewFigaroAtom);
  const [reply, setReply] = useState<OutfitsReply | undefined>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!client) return;
    let live = true;
    client.connection.call<OutfitsReply>("angelus.outfits", {}).then(
      (r) => live && setReply(r),
      (err: unknown) => live && setError(err instanceof Error && err.message ? err.message : "network"),
    );
    return () => {
      live = false;
    };
  }, [client]);
  const applied = row?.outfit_name || valueAt(bound?.root, "system.outfit");
  const names = reply?.outfits?.map((o) => o.name) ?? reply?.names ?? [];
  return (
    <>
      {applied && (
        <dl className="fw-pit-state">
          <div className="fw-pit-fact">
            <dt>Worn</dt>
            <dd>{applied}</dd>
          </div>
        </dl>
      )}
      {!reply && <p className="fw-note">{error ? "No outfit list: " + error : "Loading the outfits."}</p>}
      <PitList label="Outfits">
        {names.map((n) => (
          <PitRow
            key={n}
            glyph={glyphs["pit.models"]}
            label={n}
            meta={n === reply?.default ? "default" : ""}
            current={n === applied}
            action="outfit"
            id={n}
            onClick={() => {
              setSnap("closed");
              openNew(n);
            }}
          />
        ))}
      </PitList>
      {reply && <p className="fw-note">Tap an outfit to make a new figaro in it.</p>}
    </>
  );
}
