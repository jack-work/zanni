import { Tree, glyphs, type TreeNodeData } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { OlderArias } from "./older";
import { ancestorsOf, formNodes, topologyNodes } from "../lib/topology";
import { topologyFormsAtom, treeStateAtom } from "../state/pit";
import { attendedAtom, clientAtom, goAtom, storeNameAtom } from "../state/route";

const ARM_MS = 5000;

export function TopologyTree({ onVisit, autoFocus, className }: { onVisit?: () => void; autoFocus?: boolean; className?: string }) {
  const tree = useAtomValue(treeStateAtom);
  const forms = useAtomValue(topologyFormsAtom);
  const attended = useAtomValue(attendedAtom);
  const client = useAtomValue(clientAtom);
  const store = useAtomValue(storeNameAtom);
  const go = useSetAtom(goAtom);
  const last = useRef<string | undefined>(undefined);
  if (attended) last.current = attended.aria;
  const here = attended?.aria ?? last.current;
  const [note, setNote] = useState("");
  const armed = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => clearTimeout(armed.current?.timer), []);
  const roots = useMemo(() => (tree ? topologyNodes(tree, here, forms) : []), [tree, here, forms]);
  const open = useMemo(() => {
    const chain = tree ? ancestorsOf(tree, here) : new Set<string>();
    if (here) chain.add(here);
    return chain;
  }, [tree, here]);
  const defaultOpen = useMemo(() => (id: string) => id.startsWith("@") || open.has(id), [open]);
  if (!tree) return <p className="fw-note">No such store.</p>;

  const kill = (id: string) => {
    const node = tree.nodes.get(id);
    if (!node || !client) return;
    const name = node.handle ?? node.label;
    if (armed.current?.id === id) {
      clearTimeout(armed.current.timer);
      armed.current = null;
      setNote("");
      client.connection.call("figaro.kill", { figaro_id: id }).then(
        () => setNote("Killed " + name + "."),
        (err: unknown) => setNote("Not killed: " + (err instanceof Error && err.message ? err.message : "network")),
      );
      return;
    }
    clearTimeout(armed.current?.timer);
    armed.current = { id, timer: setTimeout(() => ((armed.current = null), setNote("")), ARM_MS) };
    setNote("press x again to kill " + name);
  };

  const status = tree.error && roots.length === 0 ? "No arias to show here." : !tree.ready && roots.length === 0 ? "Loading the topology." : roots.length === 0 ? "No arias." : "";
  return (
    <>
      <Tree
        className={["fw-topology", className].filter(Boolean).join(" ")}
        label="Topology"
        testid="topology"
        roots={roots}
        mark={glyphs.select}
        current={here}
        defaultOpen={defaultOpen}
        autoFocus={autoFocus}
        keys={{ x: kill }}
        onActivate={(id) => {
          if (id.startsWith("@")) return;
          onVisit?.();
          go({ store, aria: id });
        }}
      />
      <OlderArias shown={new Set(tree.nodes.keys())} more={tree.more} onVisit={onVisit} />
      {(note || status) && (
        <p className="fw-note" role="status">
          {note || status}
        </p>
      )}
    </>
  );
}

export function FormTree({ root, autoFocus, className, onEdit }: { root: unknown; autoFocus?: boolean; className?: string; onEdit?: (path: string) => void }) {
  const nodes: TreeNodeData[] = useMemo(() => formNodes(root), [root]);
  return <Tree className={["fw-formtree", className].filter(Boolean).join(" ")} label="Bound form" testid="form" roots={nodes} mark={glyphs["pit.form.mark"]} autoFocus={autoFocus} onEdit={onEdit} />;
}
