import { useAtomValue, useSetAtom } from "jotai";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { linkAtom } from "../state/aria";
import { attendedAtom } from "../state/route";

export function TurnActions({ turn }: { turn: number }) {
  const at = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const forking = useAtomValue(composerAtom(at ? keyOf(at.store, at.aria) : "")).forking;
  return (
    <span className="fw-actions">
      <button type="button" className="fw-fork-here" disabled={link !== "live" || forking} onClick={() => void fork(turn)}>
        Fork here
      </button>
    </span>
  );
}
