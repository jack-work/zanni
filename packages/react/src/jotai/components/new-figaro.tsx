import { Button, Sheet as ZSheet } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { closeNewFigaroAtom, createFigaroAtom, newFigaroAtom } from "../state/new-figaro";

export function NewFigaro() {
  const state = useAtomValue(newFigaroAtom);
  const close = useSetAtom(closeNewFigaroAtom);
  return (
    <ZSheet open={state.open} onClose={() => close()} className="fw-sheet fw-new-sheet" label="New figaro" title="New figaro">
      <NewFigaroBody />
    </ZSheet>
  );
}

function NewFigaroBody() {
  const state = useAtomValue(newFigaroAtom);
  const create = useSetAtom(createFigaroAtom);
  const [outfits, setOutfits] = useState(state.outfits ?? "");
  const [text, setText] = useState("");
  const submit = (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    void create({ outfits, text });
  };
  return (
    <form className="fw-new-form" onSubmit={submit}>
      <label className="fw-field">
        <span className="fw-field-label">Outfits</span>
        <input value={outfits} onChange={(e) => setOutfits(e.target.value)} placeholder="optional, e.g. sonn5-kic" disabled={state.creating} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <label className="fw-field">
        <span className="fw-field-label">First message</span>
        <textarea data-autofocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="optional" disabled={state.creating} />
      </label>
      {state.note && (
        <p className="fw-note" role="status">
          {state.note}
        </p>
      )}
      <div className="fw-new-actions">
        <Button type="submit" variant="accent" disabled={state.creating}>
          {state.creating ? "Creating" : "Create"}
        </Button>
      </div>
    </form>
  );
}
