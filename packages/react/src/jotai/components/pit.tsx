import { Button, Pit as ZPit, glyphs, usePit } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { PHASE_WORDS, labelOf } from "../lib/roster";
import { linkAtom } from "../state/aria";
import { toggleVoiceAtom, voiceAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { openNewFigaroAtom } from "../state/new-figaro";
import { attendedRowAtom } from "../state/roster";
import { attendedAtom, storeNameAtom } from "../state/route";

export function Pit() {
  const pit = usePit();
  const link = useAtomValue(linkAtom);
  const { mark } = useAtomValue(bootAtom);
  const attended = useAtomValue(attendedAtom);
  const row = useAtomValue(attendedRowAtom);
  const store = useAtomValue(storeNameAtom);
  const voice = useAtomValue(voiceAtom);
  const toggleVoice = useSetAtom(toggleVoiceAtom);
  const openNew = useSetAtom(openNewFigaroAtom);
  const word = PHASE_WORDS[link] ?? "";
  const facts: [string, string][] = [["Link", word], ["Store", store]];
  if (attended) facts.push(["Aria", attended.aria]);
  if (row?.mantra) facts.push(["Mantra", row.mantra]);
  return (
    <ZPit className="fw-pit" label="Controls" title={attended ? labelOf(row) || attended.aria.slice(0, 8) : "figaro web"} glyph={glyphs["pit.form"]} icon={mark ? <img className="fw-head" alt="" src={mark} /> : undefined}>
      <dl className="fw-pit-state">
        {facts.map(([k, v]) => (
          <div key={k} className="fw-pit-fact">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Button
        variant="accent"
        className="fw-pit-new"
        onClick={() => {
          pit?.setSnap("closed");
          openNew();
        }}
      >
        New figaro
      </Button>
      <Button variant="outline" className="fw-voice" aria-pressed={voice} onClick={() => toggleVoice()}>
        {voice ? "Voice on" : "Voice off"}
      </Button>
    </ZPit>
  );
}
