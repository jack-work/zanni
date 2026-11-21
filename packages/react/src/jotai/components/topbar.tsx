import { Button } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { PHASE_WORDS } from "../lib/roster";
import { bootAtom } from "../state/boot";
import { linkAtom } from "../state/aria";
import { toggleVoiceAtom, voiceAtom } from "../state/audio";
import { openNewFigaroAtom } from "../state/new-figaro";

export function TopBar() {
  const link = useAtomValue(linkAtom);
  const { mark } = useAtomValue(bootAtom);
  const voice = useAtomValue(voiceAtom);
  const toggleVoice = useSetAtom(toggleVoiceAtom);
  const openNew = useSetAtom(openNewFigaroAtom);
  const word = PHASE_WORDS[link] ?? "";
  return (
    <header className="fw-top">
      <a className="fw-mark" href="#/">
        {mark && <img className="fw-head" alt="" src={mark} />}
        <span className="fw-title">figaro web</span>
      </a>
      <div className="fw-bar">
        {word && (
          <span className="fw-link" role="status">
            {word}
          </span>
        )}
        <Button variant="accent" className="fw-top-new" aria-label="New figaro" onClick={() => openNew()}>
          New
        </Button>
        <Button variant="outline" className="fw-voice" aria-pressed={voice} onClick={() => toggleVoice()}>
          {voice ? "Voice on" : "Voice off"}
        </Button>
      </div>
    </header>
  );
}
