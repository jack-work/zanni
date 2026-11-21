import { useAtomValue, useSetAtom } from "jotai";
import { replayAtom } from "../state/audio";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { linkAtom } from "../state/aria";
import { attendedAtom } from "../state/route";

export function TurnActions({ turn }: { turn: number }) {
  const at = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const replay = useSetAtom(replayAtom);
  const forking = useAtomValue(composerAtom(at ? keyOf(at.store, at.aria) : "")).forking;
  return (
    <span className="fw-actions">
      <button type="button" className="z2-control fw-play" data-size="compact" onClick={() => replay(turn)}>
        Play
      </button>
      <button type="button" className="z2-control fw-fork-here" data-size="compact" disabled={link !== "live" || forking} onClick={() => void fork(turn)}>
        Fork here
      </button>
    </span>
  );
}
