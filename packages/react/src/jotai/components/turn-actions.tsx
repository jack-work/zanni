import { ActionBar, Button, Glyph, glyphs } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { handsFreeAtom, replayAtom } from "../state/audio";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { linkAtom } from "../state/aria";
import { attendedAtom } from "../state/route";

export function TurnActions({ turn, playable }: { turn: number; playable: boolean }) {
  const at = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const replay = useSetAtom(replayAtom);
  const handsFree = useAtomValue(handsFreeAtom);
  const forking = useAtomValue(composerAtom(at ? keyOf(at.store, at.aria) : "")).forking;
  return (
    <ActionBar>
      {playable && (
        <Button variant="ghost" size="compact" className={handsFree ? "fw-play fw-play-icon fw-play-big" : "fw-play fw-play-icon"} aria-label="Play reply" title="Play reply" data-action="play" onClick={() => replay(turn)}>
          <Glyph glyph={glyphs["state.running"]} />
        </Button>
      )}
      <Button variant="ghost" size="compact" className="fw-fork-here" disabled={link !== "live" || forking} onClick={() => void fork(turn)}>
        Fork here
      </Button>
    </ActionBar>
  );
}
