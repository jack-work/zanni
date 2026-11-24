import { Button, Pane } from "../../index";
import { useAtom, useSetAtom } from "jotai";
import { openNewFigaroAtom } from "../state/new-figaro";
import { paneAtom } from "../state/pane";
import { TopologyTree } from "./tree-view";

export function Roster() {
  const openNew = useSetAtom(openNewFigaroAtom);
  const [pane, setPane] = useAtom(paneAtom);
  return (
    <Pane as="nav" className="fw-side" id="fw-arias" label="Arias" open={pane.open} width={pane.width} onWidth={(width) => setPane({ width })}>
      <div className="fw-side-head">
        <h2 className="fw-h2">Arias</h2>
        <div className="fw-side-tools">
          <Button className="fw-narrow" aria-pressed={pane.narrow} onClick={() => setPane({ narrow: !pane.narrow })}>
            Narrow
          </Button>
          <Button variant="accent" className="fw-new-figaro" onClick={() => openNew()}>
            New
          </Button>
        </div>
      </div>
      <TopologyTree />
    </Pane>
  );
}
