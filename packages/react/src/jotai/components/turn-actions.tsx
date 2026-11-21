import { ActionBar, Button } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { handsFreeAtom, replayAtom } from "../state/audio";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { linkAtom } from "../state/aria";
import { attendedAtom } from "../state/route";

export function TurnActions({ turn }: { turn: number }) {
  const at = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const replay = useSetAtom(replayAtom);
  const handsFree = useAtomValue(handsFreeAtom);
  const forking = useAtomValue(composerAtom(at ? keyOf(at.store, at.aria) : "")).forking;
  return (
    <ActionBar>
      {handsFree && (
        <Button variant="ghost" size="compact" className="fw-play fw-play-big" onClick={() => replay(turn)}>
          Play
        </Button>
      )}
      <Button variant="ghost" size="compact" className="fw-fork-here" disabled={link !== "live" || forking} onClick={() => void fork(turn)}>
        Fork here
      </Button>
    </ActionBar>
  );
}
