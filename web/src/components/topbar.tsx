import { useAtomValue, useSetAtom } from "jotai";
import { PHASE_WORDS } from "../lib/roster";
import { bootAtom } from "../state/boot";
import { linkAtom } from "../state/aria";
import { toggleVoiceAtom, voiceAtom } from "../state/audio";

export function TopBar() {
  const link = useAtomValue(linkAtom);
  const { mark } = useAtomValue(bootAtom);
  const voice = useAtomValue(voiceAtom);
  const toggleVoice = useSetAtom(toggleVoiceAtom);
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
        <button type="button" className="fw-voice" aria-pressed={voice} onClick={() => toggleVoice()}>
          {voice ? "Voice on" : "Voice off"}
        </button>
      </div>
    </header>
  );
}
