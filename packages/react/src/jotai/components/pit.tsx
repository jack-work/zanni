import { Button, Pit as ZPit, glyphs } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { PHASE_WORDS } from "../lib/roster";
import { linkAtom } from "../state/aria";
import { toggleVoiceAtom, voiceAtom } from "../state/audio";

export function Pit() {
  const link = useAtomValue(linkAtom);
  const voice = useAtomValue(voiceAtom);
  const toggleVoice = useSetAtom(toggleVoiceAtom);
  const word = PHASE_WORDS[link] ?? "";
  return (
    <ZPit className="fw-pit" label="Controls" title="figaro" glyph={glyphs["pit.form"]}>
      {word && (
        <p className="fw-pit-link" role="status">
          {word}
        </p>
      )}
      <Button variant="outline" className="fw-pit-voice" aria-pressed={voice} onClick={() => toggleVoice()}>
        {voice ? "Voice on" : "Voice off"}
      </Button>
    </ZPit>
  );
}
