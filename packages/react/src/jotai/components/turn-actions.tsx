import { ActionBar, Button, Glyph, glyphs } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { handsFreeAtom, playInquiryAtom, replayAtom } from "../state/audio";
import { composerAtom, forkAtom, keyOf } from "../state/composer";
import { linkAtom } from "../state/aria";
import { attendedAtom } from "../state/route";

export function TurnActions({ turn, playable, inquiry }: { turn: number; playable: boolean; inquiry: boolean }) {
  const at = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  const fork = useSetAtom(forkAtom);
  const replay = useSetAtom(replayAtom);
  const playInquiry = useSetAtom(playInquiryAtom);
  const handsFree = useAtomValue(handsFreeAtom);
  const forking = useAtomValue(composerAtom(at ? keyOf(at.store, at.aria) : "")).forking;
  return (
    <ActionBar>
      {playable && (
        <Button variant="ghost" size="compact" className={handsFree ? "fw-play fw-play-icon fw-play-big" : "fw-play fw-play-icon"} aria-label="Play inquiry and reply" title="Play inquiry and reply" data-action="play" onClick={() => (handsFree || !inquiry ? replay(turn) : playInquiry({ turn, then: true }))}>
          <Glyph glyph={glyphs["audio.play"]} />
        </Button>
      )}
      <Button variant="ghost" size="compact" className="fw-fork-here" disabled={link !== "live" || forking} onClick={() => void fork(turn)}>
        Fork here
      </Button>
    </ActionBar>
  );
}
