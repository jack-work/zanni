import { useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { bare } from "./charter";
import type { ReadyView, Read } from "./derive";
import { EDGE_KINDS, collapse, graphOf, nodeAt, type EdgeKind, type Graph } from "./graph";
import { KINDS, NEXT_DIR, VIEWS, type Dir } from "./graph-kinds";
import { layoutOf } from "./graph-layout";
import { Detail, Overview } from "./graph-side";
import { Stage } from "./graph-view";
import { entriesOf, type GraphView } from "./queue";
import type { PageContext } from "./rows";
import { shortId } from "./roles";
import { openAtom, readsAtom } from "./state";

const WHY: Record<string, string> = { closed: "closed to you", gone: "gone", failed: "could not be read", incompatible: "cannot be read by this page" };

export function unreadableOf(reads: readonly Read[]): { id: string; why: string }[] {
  return reads.flatMap((r) => {
    if (r.role || r.queue || r.form.ready) return [];
    const why = r.form.refusal !== undefined ? "closed" : r.form.phase;
    return WHY[why] ? [{ id: r.id, why: WHY[why]! }] : [];
  });
}

function Chip({ className, kind, pressed, onClick, children }: { className: string; kind?: EdgeKind; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={"og-chip " + className + (kind ? " og-c-" + kind : "")} aria-pressed={pressed} data-chip={kind} onClick={onClick}>
      {children}
    </button>
  );
}

export function GraphPage({ client, view, page, overrides }: { client: AriaClient; view: ReadyView; page: PageContext; overrides: "applied" | "unreadable" }) {
  const reads = useAtomValue(readsAtom);
  const open = useSetAtom(openAtom);
  const [on, setOn] = useState<Record<EdgeKind, boolean>>(() => Object.fromEntries(EDGE_KINDS.map((k) => [k, true])) as Record<EdgeKind, boolean>);
  const [dir, setDir] = useState<Dir>("both");
  const [anim, setAnim] = useState(false);
  const minute = Math.floor(page.now / 60_000);

  const entries = useMemo(() => new Map(reads.flatMap((r) => (r.queue ? [[bare(r.id), entriesOf(r.form.root)] as const] : []))), [reads]);
  const full = useMemo<Graph>(() => graphOf({ topology: view.topology, atlas: view.atlas, entries, nameOf: page.nameOf, now: minute * 60_000 }), [view.topology, view.atlas, entries, page.nameOf, minute]);
  const graph = useMemo(() => (page.route.view === "command" ? collapse(full) : full), [full, page.route.view]);
  const layout = useMemo(() => layoutOf(graph), [graph]);
  const selected = nodeAt(graph, page.route.node);
  const bad = useMemo(() => unreadableOf(reads), [reads]);

  useEffect(() => {
    if (!selected) return;
    for (const el of document.querySelectorAll<SVGGElement>("[data-node]")) if (el.getAttribute("data-node") === selected.id && el.closest(".og-stage")) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected?.id, page.route.view]);

  const setView = (v: GraphView): void => open({ view: v });
  const select = (id: string | undefined): void => open({ node: id });
  const flip = (k: EdgeKind): void => setOn((s) => ({ ...s, [k]: !s[k] }));
  const all = (v: boolean): void => setOn(Object.fromEntries(EDGE_KINDS.map((k) => [k, v])) as Record<EdgeKind, boolean>);

  return (
    <section className="og" data-field="graph" data-central={view.central} data-view={page.route.view}>
      <div className="og-bar" role="toolbar" aria-label="Graph view and relationships">
        {(Object.keys(VIEWS) as GraphView[]).map((v) => (
          <Chip key={v} className="og-view" pressed={page.route.view === v} onClick={() => setView(v)}>
            {VIEWS[v].label}
          </Chip>
        ))}
        <span className="og-sep" />
        {EDGE_KINDS.map((k) => (
          <Chip key={k} className={KINDS[k].dash ? "og-dash" : ""} kind={k} pressed={on[k]} onClick={() => flip(k)}>
            <i />
            {KINDS[k].label}
          </Chip>
        ))}
        <span className="og-sep" />
        <Chip className="og-plain" onClick={() => all(true)}>
          all
        </Chip>
        <Chip className="og-plain" onClick={() => all(false)}>
          none
        </Chip>
        <Chip className="og-plain" onClick={() => setDir(NEXT_DIR[dir])}>
          direction: {dir}
        </Chip>
        <Chip className="og-plain" pressed={anim} onClick={() => setAnim(!anim)}>
          animate flow
        </Chip>
      </div>
      {overrides === "unreadable" && (
        <p className="og-note" data-field="overrides-note">
          Drawn placement is unreadable: seats sit where their forks put them.
        </p>
      )}
      {bad.length > 0 && (
        <p className="og-note" data-field="unreadable">
          {bad.length === 1 ? "1 chartered form is" : bad.length + " chartered forms are"} not readable:{" "}
          {bad.map((b) => shortId(b.id) + " (" + b.why + ")").join(", ")}
        </p>
      )}
      <div className="og-wrap">
        <Stage graph={graph} layout={layout} selected={selected?.id} on={on} dir={dir} anim={anim} onSelect={select} />
        <aside className="og-side" aria-live="polite">
          {selected ? <Detail node={selected} graph={graph} on={on} client={client} page={page} central={view.central} /> : <Overview graph={graph} view={page.route.view} on={on} />}
        </aside>
      </div>
    </section>
  );
}
