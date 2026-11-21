import { Tree, glyphs, type TreeNodeData } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo, useState } from "react";
import { ancestorsOf, formNodes, topologyNodes } from "../lib/topology";
import { factsOfAtom, nodeFormAtom, treeStateAtom } from "../state/pit";
import { attendedAtom, goAtom, storeNameAtom } from "../state/route";

export function TopologyTree({ onVisit, autoFocus, className }: { onVisit?: () => void; autoFocus?: boolean; className?: string }) {
  const tree = useAtomValue(treeStateAtom);
  const [shown, setShown] = useState<readonly string[]>([]);
  const factsAtom = useMemo(() => factsOfAtom(shown), [shown]);
  const facts = useAtomValue(factsAtom);
  const attended = useAtomValue(attendedAtom);
  const store = useAtomValue(storeNameAtom);
  const go = useSetAtom(goAtom);
  const here = attended?.aria;
  const nodeForm = useAtomValue(nodeFormAtom);
  const nodeChildren = nodeForm?.ready ? Object.keys(nodeForm.root).length : undefined;
  const roots = useMemo(() => {
    if (!tree) return [];
    const counts: Record<string, number> = {};
    for (const id of Object.keys(facts)) {
      const turns = facts[id]?.turns;
      if (turns !== undefined) counts[id] = turns;
    }
    return topologyNodes(tree, here, store, counts, nodeChildren);
  }, [tree, facts, here, store, nodeChildren]);
  const open = useMemo(() => {
    const chain = tree ? ancestorsOf(tree, here) : new Set<string>();
    if (here) chain.add(here);
    return chain;
  }, [tree, here]);
  const defaultOpen = useMemo(() => (id: string) => id.startsWith("@") || open.has(id), [open]);
  if (!tree) return <p className="fw-note">No such store.</p>;
  const status = tree.error ? "No topology: " + tree.error : !tree.ready && roots.length === 0 ? "Loading the topology." : roots.length === 0 ? "No arias." : "";
  return (
    <>
      <Tree
        className={["fw-topology", className].filter(Boolean).join(" ")}
        label="Topology"
        roots={roots}
        mark={glyphs.select}
        current={here}
        defaultOpen={defaultOpen}
        autoFocus={autoFocus}
        onRows={setShown}
        onActivate={(id) => {
          if (id.startsWith("@")) return;
          onVisit?.();
          go({ store, aria: id });
        }}
      />
      {status && <p className="fw-note">{status}</p>}
    </>
  );
}

export function FormTree({ root, autoFocus, className }: { root: unknown; autoFocus?: boolean; className?: string }) {
  const nodes: TreeNodeData[] = useMemo(() => formNodes(root), [root]);
  return <Tree className={["fw-formtree", className].filter(Boolean).join(" ")} label="Bound form" roots={nodes} mark={glyphs["pit.form.mark"]} autoFocus={autoFocus} />;
}
