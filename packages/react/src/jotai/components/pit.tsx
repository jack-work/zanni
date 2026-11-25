import { Button, Pit as ZPit, PitList, PitRow, glyphs, usePit } from "../../index";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { PIT_ROWS, EFFORT_KEY, FORKED_FROM_KEY, byLastUsed, valueAt, type PitRowId, type PitView } from "../lib/pit-rows";
import { PHASE_WORDS, labelOf } from "../lib/roster";
import { AsksView, useAsks } from "./asks";
import { ControlStatus } from "./control-status";
import { OlderArias } from "./older";
import { TopologyTree, FormTree } from "./tree-view";
import { FormEdit, type FormEditTarget } from "./form-edit";
import { turnsAtom, linkAtom } from "../state/aria";
import { toggleVoiceAtom, voiceAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { openNewFigaroAtom } from "../state/new-figaro";
import { attendedFactsAtom, boundStateAtom, markPitUsedAtom, pitUsedAtom, pitViewAtom, recentStateAtom, treeStateAtom } from "../state/pit";
import { attendedRowAtom, rosterAtom } from "../state/roster";
import { attendedAtom, clientAtom, goAtom, storeNameAtom } from "../state/route";

const TITLES: Record<PitView, string> = {
  list: "",
  state: "State",
  "fork-at": "Fork at turn",
  tree: "Tree",
  recent: "Recent",
  asks: "Asks",
  outfits: "Outfits",
};

const FACE: Record<PitView, string> = {
  list: glyphs["pit.form"],
  state: glyphs["pit.form"],
  "fork-at": glyphs.fork,
  tree: glyphs["pit.troupe"],
  recent: glyphs["pit.form"],
  asks: glyphs["pit.form"],
  outfits: glyphs["pit.models"],
};

export function Pit() {
  const pit = usePit();
  const [view, setView] = useAtom(pitViewAtom);
  const { mark } = useAtomValue(bootAtom);
  const attended = useAtomValue(attendedAtom);
  const own = useAtomValue(attendedFactsAtom);
  const closed = pit?.snap === "closed";
  useEffect(() => {
    if (closed) setView("list");
  }, [closed, setView]);
  const name = attended ? own?.mantra || attended.aria.slice(0, 8) : "figaro web";
  return (
    <ZPit className="fw-pit" label="Controls" title={view === "list" ? name : TITLES[view]} glyph={FACE[view]} icon={mark ? <img className="fw-head" alt="" src={mark} /> : undefined}>
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
      {view === "outfits" && <OutfitsView />}
    </ZPit>
  );
}

function ControlList() {
  const pit = usePit();
  const setView = useSetAtom(pitViewAtom);
  const used = useAtomValue(pitUsedAtom);
  const markUsed = useSetAtom(markPitUsedAtom);
  const attended = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  const forking = useAtomValue(composerAtom(attended ? keyOf(attended.store, attended.aria) : "")).forking;
  const bound = useAtomValue(boundStateAtom);
  const tree = useAtomValue(treeStateAtom);
  const recent = useAtomValue(recentStateAtom);
  const row = useAtomValue(attendedRowAtom);
  const asks = useAsks();
  const voice = useAtomValue(voiceAtom);
  const toggleVoice = useSetAtom(toggleVoiceAtom);
  const openNew = useSetAtom(openNewFigaroAtom);
  const fork = useSetAtom(forkAtom);
  const live = link === "live";

  const meta: Partial<Record<PitRowId, string>> = {
    state: valueAt(bound?.root, EFFORT_KEY) ?? "",
    tree: tree?.nodes.size ? String(tree.nodes.size) : "",
    recent: recent?.rows.length ? String(recent.rows.length) : "",
    asks: asks.asks.length ? String(asks.asks.length) : "",
    outfits: row?.outfit_name ?? "",
    voice: voice ? "on" : "off",
  };
  const act: Record<PitRowId, () => void> = {
    new: () => {
      pit?.setSnap("closed");
      openNew();
    },
    state: () => setView("state"),
    "tail-fork": () => {
      pit?.setSnap("closed");
      void fork(0);
    },
    "fork-at": () => setView("fork-at"),
    tree: () => setView("tree"),
    recent: () => setView("recent"),
    asks: () => setView("asks"),
    outfits: () => setView("outfits"),
    voice: () => toggleVoice(),
  };
  const off = (id: PitRowId): boolean => (id === "tail-fork" ? !attended || !live || forking : id === "state" || id === "fork-at" || id === "outfits" ? !attended : false);

  return (
    <PitList label="Controls">
      {byLastUsed(PIT_ROWS, used).map((r) => (
        <PitRow
          key={r.id}
          glyph={r.glyph}
          label={r.label}
          meta={meta[r.id]}
          action={r.id}
          className={r.id === "voice" ? "fw-voice" : "fw-pit-act"}
          pressed={r.id === "voice" ? voice : undefined}
          disabled={off(r.id)}
          onClick={() => {
            markUsed(r.id);
            act[r.id]();
          }}
        />
      ))}
    </PitList>
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
  const pit = usePit();
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
        pit?.setSnap("closed");
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
  const pit = usePit();
  return <TopologyTree autoFocus onVisit={() => pit?.setSnap("closed")} />;
}

function RecentView() {
  const pit = usePit();
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
              pit?.setSnap("closed");
              go({ store, aria: r.id });
            }}
          />
        ))}
      </PitList>
      <OlderArias shown={new Set(recent.rows.map((r) => r.id))} more={recent.more} onVisit={() => pit?.setSnap("closed")} />
    </>
  );
}

interface OutfitsReply {
  default?: string;
  names?: string[];
  outfits?: { name: string; path?: string; origin?: string }[];
}

function OutfitsView() {
  const pit = usePit();
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
              pit?.setSnap("closed");
              openNew(n);
            }}
          />
        ))}
      </PitList>
      {reply && <p className="fw-note">Tap an outfit to make a new figaro in it.</p>}
    </>
  );
}
