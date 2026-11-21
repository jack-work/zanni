import { Button } from "../../index";
import { useSetAtom } from "jotai";
import { openNewFigaroAtom } from "../state/new-figaro";
import { TopologyTree } from "./tree-view";

export function Roster() {
  const openNew = useSetAtom(openNewFigaroAtom);
  return (
    <nav className="fw-side" aria-label="Arias">
      <div className="fw-side-head">
        <h2 className="fw-h2">Arias</h2>
        <div className="fw-side-tools">
          <Button variant="accent" className="fw-new-figaro" onClick={() => openNew()}>
            New
          </Button>
        </div>
      </div>
      <TopologyTree />
    </nav>
  );
}
