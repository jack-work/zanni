import { EDGE_KINDS, type EdgeKind, type Graph } from "./graph";
import { KINDS, type Dir } from "./graph-kinds";
import type { Layout } from "./graph-layout";

const MARGIN = 24;

export function touches(e: { a: string; b: string }, sel: string | undefined, dir: Dir): boolean {
  if (!sel) return true;
  if (dir === "out") return e.a === sel;
  if (dir === "in") return e.b === sel;
  return e.a === sel || e.b === sel;
}

export function litNodes(graph: Graph, on: Record<EdgeKind, boolean>, sel: string | undefined, dir: Dir): Set<string> {
  const lit = new Set<string>(sel ? [sel] : graph.nodes.map((n) => n.id));
  if (sel) for (const e of graph.edges) if (on[e.kind] && touches(e, sel, dir)) lit.add(e.a).add(e.b);
  return lit;
}

export interface StageProps {
  readonly graph: Graph;
  readonly layout: Layout;
  readonly selected: string | undefined;
  readonly on: Record<EdgeKind, boolean>;
  readonly dir: Dir;
  readonly anim: boolean;
  readonly onSelect: (id: string | undefined) => void;
}

export function Stage({ graph, layout, selected, on, dir, anim, onSelect }: StageProps) {
  const b = layout.bounds;
  const lit = litNodes(graph, on, selected, dir);
  const width = b.w + MARGIN * 2;
  const height = b.h + MARGIN * 2;
  return (
    <div className="og-stage" data-field="stage" tabIndex={-1}>
      <svg className={"og-svg" + (anim ? " og-anim" : "")} viewBox={`${b.x - MARGIN} ${b.y - MARGIN} ${width} ${height}`} width={width} height={height} role="group" aria-label="Order graph" onClick={() => onSelect(undefined)}>
        <defs>
          {EDGE_KINDS.map((k) => (
            <marker key={k} id={"og-m-" + k} className={"og-mk og-mk-" + k} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          ))}
        </defs>
        <g>
          {layout.edges.map((e, i) => {
            const show = on[e.kind];
            const hit = show && touches(e, selected, dir);
            return (
              <path key={i} className={"og-edge og-e-" + e.kind + (KINDS[e.kind].dash ? " og-dashed" : "") + (!show ? " og-hide" : show && !hit ? " og-dim" : "")} d={e.d} markerEnd={`url(#og-m-${e.kind})`} data-edge={e.kind} data-from={e.a} data-to={e.b} />
            );
          })}
        </g>
        <g>
          {graph.nodes.map((n) => {
            const box = layout.boxes.get(n.id);
            const text = layout.text.get(n.id);
            if (!box || !text) return null;
            const cls = ["og-node", "og-" + n.kind, n.tone ? "og-tone-" + n.tone : "", selected === n.id ? "og-sel" : "", selected && !lit.has(n.id) ? "og-dim" : ""].filter(Boolean).join(" ");
            const pick = (): void => onSelect(selected === n.id ? undefined : n.id);
            return (
              <g
                key={n.id}
                className={cls}
                data-node={n.id}
                data-kind={n.kind}
                role="button"
                tabIndex={0}
                aria-pressed={selected === n.id}
                aria-label={n.label + ", " + n.sub}
                onClick={(ev) => {
                  ev.stopPropagation();
                  pick();
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    pick();
                  }
                }}
              >
                <title>{n.label + ", " + n.sub}</title>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={9} />
                <text className="og-label" x={box.x + box.w / 2} y={box.y + box.h / 2 - 2} textAnchor="middle">
                  {text.label}
                </text>
                <text className="og-sub" x={box.x + box.w / 2} y={box.y + box.h / 2 + 14} textAnchor="middle">
                  {text.sub}
                </text>
              </g>
            );
          })}
        </g>
        <g>
          {layout.edges.map((e, i) => {
            if (!e.label || !e.lp) return null;
            const show = on[e.kind];
            const hit = show && touches(e, selected, dir);
            return (
              <text key={i} className={"og-elabel og-l-" + e.kind + (!show ? " og-hide" : show && !hit ? " og-dim" : "")} x={e.lp.x} y={e.lp.y + 4} textAnchor="middle">
                {e.label}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
