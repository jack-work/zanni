import type { ReactNode } from "react";
import type { AriaClient } from "figaro-forms/aria";
import { bare, standing } from "./charter";
import { fanoutText, hasLimits, mismatchText } from "./facts";
import { EDGE_KINDS, type EdgeKind, type Graph, type GraphEdge, type GraphNode } from "./graph";
import { KINDS, VIEWS } from "./graph-kinds";
import { QueueDetail } from "./queue-detail";
import { orderHash, type GraphView } from "./queue";
import { Chip, type PageContext } from "./rows";
import { shortId } from "./roles";

function Fact({ name, tone, children }: { name: string; tone?: string; children: ReactNode }) {
  return (
    <div className="og-fact" data-field={name} data-tone={tone}>
      <dt>{name.replace(/_/g, " ")}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Swatch({ kind }: { kind: EdgeKind }) {
  return <span className={"og-sw og-sw-" + kind} />;
}

function Relation({ e, other, graph, central }: { e: GraphEdge; other: string; graph: Graph; central: string }) {
  const n = graph.nodes.find((x) => x.id === other);
  if (!n) return null;
  return (
    <li data-rel={e.kind}>
      <Swatch kind={e.kind} />
      {KINDS[e.kind].label}:{" "}
      <a className="ord-link" href={orderHash(central, n.id)} data-node-link={n.id}>
        {n.label}
      </a>
      {e.label && <span className="og-hint"> ({e.label})</span>}
    </li>
  );
}

function Relations({ node, graph, on, central }: { node: GraphNode; graph: Graph; on: Record<EdgeKind, boolean>; central: string }) {
  const shown = graph.edges.filter((e) => on[e.kind]);
  const out = shown.filter((e) => e.a === node.id);
  const inn = shown.filter((e) => e.b === node.id);
  return (
    <>
      <h3 className="og-h">outgoing</h3>
      <ul className="og-list" data-field="outgoing">
        {out.length === 0 && <li className="og-hint">none shown</li>}
        {out.map((e, i) => (
          <Relation key={i} e={e} other={e.b} graph={graph} central={central} />
        ))}
      </ul>
      <h3 className="og-h">incoming</h3>
      <ul className="og-list" data-field="incoming">
        {inn.length === 0 && <li className="og-hint">none shown</li>}
        {inn.map((e, i) => (
          <Relation key={i} e={e} other={e.a} graph={graph} central={central} />
        ))}
      </ul>
    </>
  );
}

function RoleFacts({ node, graph, central }: { node: GraphNode; graph: Graph; central: string }) {
  const role = node.role;
  if (!role) return null;
  const c = role.chartered;
  const target = graph.edges.find((e) => e.kind === "target" && e.a === node.id);
  const holder = target ? graph.nodes.find((n) => n.id === target.b) : undefined;
  const drawn = holder?.seat?.drawnChildren;
  const tone = hasLimits(role) && drawn !== undefined ? standing(role.fanout, drawn) : "within";
  const nameOfForm = (form: string): string => graph.nodes.find((n) => n.kind === "role" && bare(n.id) === bare(form))?.role?.name ?? shortId(form);
  return (
    <dl className="og-facts">
      {c.seat && <Fact name="seat">{c.seat}</Fact>}
      {c.regiment && <Fact name="regiment">{c.regiment}</Fact>}
      <Fact name="holder">{holder ? "held by " + (holder.holder ?? holder.label) : role.target ? "holder not visible: " + shortId(role.target) : "vacant"}</Fact>
      {hasLimits(role) && (
        <Fact name="fanout" tone={tone === "over" ? "lapsed" : tone === "short" ? "review" : undefined}>
          {fanoutText(role, drawn)}
        </Fact>
      )}
      {holder?.seat && holder.seat.skipped > 0 && <Fact name="skipped">{holder.seat.skipped === 1 ? "skips 1 unchartered" : "skips " + holder.seat.skipped + " unchartered"}</Fact>}
      {c.reportsTo && (
        <Fact name="reports_to">
          {nameOfForm(c.reportsTo)}
          {node.mismatch && " (not where it is drawn)"}
        </Fact>
      )}
      {node.mismatch && (
        <Fact name="mismatch" tone="owner">
          {mismatchText(node.mismatch)}
        </Fact>
      )}
      {c.abdication && (
        <Fact name="succession">
          {c.abdication}
          {c.ttl && ", ttl " + c.ttl}
        </Fact>
      )}
      {c.reviewerMaxChildren !== undefined && <Fact name="reviewer_limit">{c.reviewerMaxChildren} per reviewer</Fact>}
      {(node.studies ?? []).map((study) => (
        <Fact key={study.id} name="study" tone={study.found ? undefined : "lapsed"}>
          {study.found ? (
            <a className="ord-link" href={orderHash(central, study.id)} data-study={study.id}>
              {study.name}
            </a>
          ) : (
            study.name + " (not visible)"
          )}
        </Fact>
      ))}
    </dl>
  );
}

function AriaFacts({ node }: { node: GraphNode }) {
  const seat = node.seat;
  if (!seat) return null;
  const roles = node.roles ?? [];
  const limited = roles.find(hasLimits);
  const tone = limited ? standing(limited.fanout, seat.drawnChildren) : "within";
  return (
    <dl className="og-facts">
      <Fact name="holder">{node.holder ?? node.label}</Fact>
      <Fact name="roles">{roles.map((r) => r.name).join(", ")}</Fact>
      {limited && (
        <Fact name="fanout" tone={tone === "over" ? "lapsed" : tone === "short" ? "review" : undefined}>
          {fanoutText(limited, seat.drawnChildren)}
        </Fact>
      )}
      {seat.skipped > 0 && <Fact name="skipped">{seat.skipped === 1 ? "skips 1 unchartered" : "skips " + seat.skipped + " unchartered"}</Fact>}
    </dl>
  );
}

function QueueFacts({ node, client, page }: { node: GraphNode; client: AriaClient; page: PageContext }) {
  const queue = node.queue;
  if (!queue) return null;
  return (
    <>
      <div className="ord-meta og-chips">
        <Chip field="queue">queue form</Chip>
        {queue.contract && queue.contract.kinds.length > 0 && <Chip field="kinds">{queue.contract.kinds.join(", ")}</Chip>}
        {queue.contract?.priority && <Chip field="priority_map">by priority</Chip>}
        {node.tone === "stray" && (
          <Chip field="under" tone="lapsed">
            drawn under {shortId(queue.under)}
          </Chip>
        )}
      </div>
      <QueueDetail client={client} queue={queue} page={page} />
    </>
  );
}

export function Overview({ graph, view, on }: { graph: Graph; view: GraphView; on: Record<EdgeKind, boolean> }) {
  const present = EDGE_KINDS.filter((k) => graph.edges.some((e) => e.kind === k));
  return (
    <div data-field="overview">
      <h2 className="og-title">{VIEWS[view].label}</h2>
      <div className="og-sub-title">order graph</div>
      <p>{VIEWS[view].about}</p>
      <p>Gold-edged green boxes are role forms; green boxes are queue forms; plain boxes are figaros; dashed red boxes are forks drawn under a seat. Every arrow is routed around the boxes.</p>
      <h3 className="og-h">relationships</h3>
      <ul className="og-list">
        {EDGE_KINDS.map((k) => (
          <li key={k} className={on[k] ? undefined : "og-off"}>
            <Swatch kind={k} />
            <b>{KINDS[k].label}</b>: {KINDS[k].about}
            {!present.includes(k) && <span className="og-hint"> None in this graph.</span>}
          </li>
        ))}
      </ul>
      <p className="og-hint">Click a node to see who it talks to and which way. Switch the view or the relationships in the bar above.</p>
    </div>
  );
}

export function Detail({ node, graph, on, client, page, central }: { node: GraphNode; graph: Graph; on: Record<EdgeKind, boolean>; client: AriaClient; page: PageContext; central: string }) {
  return (
    <div data-field="detail" data-for={node.id} data-kind={node.kind}>
      <h2 className="og-title">{node.label}</h2>
      <div className="og-sub-title">{node.sub}</div>
      <p>{node.about}</p>
      {node.kind === "role" && <RoleFacts node={node} graph={graph} central={central} />}
      {node.kind === "aria" && <AriaFacts node={node} />}
      {node.kind === "queue" && <QueueFacts node={node} client={client} page={page} />}
      <Relations node={node} graph={graph} on={on} central={central} />
      <p className="og-hint">Click it again or the background to clear. "direction" narrows the arrows to outgoing or incoming.</p>
    </div>
  );
}
