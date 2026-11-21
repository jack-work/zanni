import { Tree, type TreeNodeData } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { FORM_COLORS, FORM_COLUMNS, TOPOLOGY_COLORS, TOPOLOGY_COLUMNS, ancestorsOf, formNodes, topologyNodes } from "../lib/topology";
import { treeStateAtom } from "../state/pit";
import { rosterAtom } from "../state/roster";
import { attendedAtom, goAtom, storeNameAtom } from "../state/route";

export function TopologyTree({ onVisit, className }: { onVisit?: () => void; className?: string }) {
  const tree = useAtomValue(treeStateAtom);
  const rows = useAtomValue(rosterAtom).rows;
  const attended = useAtomValue(attendedAtom);
  const store = useAtomValue(storeNameAtom);
  const go = useSetAtom(goAtom);
  const here = attended?.aria;
  const roots = useMemo(() => {
    if (!tree) return [];
    const counts: Record<string, number> = {};
    for (const r of rows) if (r.message_count != null) counts[r.id] = r.message_count;
    return topologyNodes(tree, here, counts);
  }, [tree, rows, here]);
  const open = useMemo(() => (tree ? ancestorsOf(tree, here) : new Set<string>()), [tree, here]);
  const defaultOpen = useMemo(() => (id: string, depth: number) => depth === 0 || open.has(id), [open]);
  if (!tree) return <p className="fw-note">No such store.</p>;
  const status = tree.error ? "No topology: " + tree.error : !tree.ready && roots.length === 0 ? "Loading the topology." : roots.length === 0 ? "No arias." : "";
  return (
    <>
      <Tree
        className={["fw-topology", className].filter(Boolean).join(" ")}
        label="Topology"
        roots={roots}
        columns={TOPOLOGY_COLUMNS}
        colors={TOPOLOGY_COLORS}
        current={here}
        defaultOpen={defaultOpen}
        onSelect={(id) => {
          onVisit?.();
          go({ store, aria: id });
        }}
      />
      {status && <p className="fw-note">{status}</p>}
    </>
  );
}

export function FormTree({ root, className }: { root: unknown; className?: string }) {
  const nodes: TreeNodeData[] = useMemo(() => formNodes(root), [root]);
  return <Tree className={["fw-formtree", className].filter(Boolean).join(" ")} label="Bound form" roots={nodes} columns={FORM_COLUMNS} colors={FORM_COLORS} />;
}
