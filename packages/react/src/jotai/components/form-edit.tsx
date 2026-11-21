import { Button } from "../../index";
import { boundFormWriterOf } from "figaro-forms/aria";
import { useEffect, useRef, useState } from "react";
import { draftOf, parseDraft, pathProblem, rawAt, refusalLine } from "../lib/form-edit";
import type { Attended } from "../state/route";

export interface FormEditTarget {
  path: string;
  fresh?: boolean;
}

export function FormEdit({ attended, root, target, onDone }: { attended: Attended; root: unknown; target: FormEditTarget; onDone: () => void }) {
  const was = target.fresh ? undefined : rawAt(root, target.path);
  const [path, setPath] = useState(target.path);
  const [draft, setDraft] = useState(draftOf(was));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  useEffect(() => field.current?.focus({ preventScroll: true }), []);
  const writer = () => boundFormWriterOf(attended.client, attended.aria);
  const finish = async (run: () => Promise<{ ok: true } | { ok: false; refusal: { kind: string; reason: string } }>, key: string) => {
    setBusy(true);
    setNote("");
    try {
      const r = await run();
      if (r.ok) onDone();
      else setNote(refusalLine(key, r.refusal));
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const key = path.trim();
    const bad = pathProblem(key);
    if (bad) return setNote(bad);
    const parsed = parseDraft(draft, was);
    if (!parsed.ok) return setNote(parsed.why);
    void finish(() => writer().set(key, parsed.value as never), key);
  };
  return (
    <form
      className="fw-new-form fw-form-edit"
      onSubmit={(ev) => {
        ev.preventDefault();
        save();
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          onDone();
        }
      }}
    >
      {target.fresh ? (
        <label className="fw-field">
          <span className="fw-field-label">Key</span>
          <input ref={field as never} value={path} onChange={(e) => setPath(e.target.value)} placeholder="title" spellCheck={false} autoCapitalize="off" />
        </label>
      ) : (
        <p className="fw-field-label fw-form-edit-key">{path}</p>
      )}
      <label className="fw-field">
        <span className="fw-field-label">Value</span>
        <textarea ref={target.fresh ? undefined : (field as never)} value={draft} onChange={(e) => setDraft(e.target.value)} rows={typeof was === "string" || was === undefined ? 2 : 4} spellCheck={false} />
      </label>
      {note && (
        <p className="fw-note fw-form-edit-note" role="alert">
          {note}
        </p>
      )}
      <div className="fw-new-actions">
        <Button type="submit" variant="accent" disabled={busy}>
          Set
        </Button>
        {!target.fresh && (
          <Button variant="quiet" disabled={busy} onClick={() => void finish(() => writer().unset(path), path)}>
            Unset
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
