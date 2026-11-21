import { Button, Glyph, PlayerIsland, Plain, audioKeyUrl, glyphs, withSession, type PlayRequest } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { clipKey, transcribeClip } from "../lib/clips";
import { joinDictation } from "../lib/mic";
import { retranscribe } from "../lib/stt";
import { beginAction, traced } from "../../trace";
import { handsFreeAtom, replayAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { draftAtom, keyOf } from "../state/composer";
import { attendedAtom } from "../state/route";

export function InlineActions({ kind, turn }: { kind: "input" | "prose"; turn: number }) {
  const at = useAtomValue(attendedAtom);
  const handsFree = useAtomValue(handsFreeAtom);
  const replay = useSetAtom(replayAtom);
  const { audioUrl, sttUrl } = useAtomValue(bootAtom);
  const setDraft = useSetAtom(draftAtom(at ? keyOf(at.store, at.aria) : ""));
  const [request, setRequest] = useState<PlayRequest | null>(null);
  const [note, setNote] = useState("");
  const [heard, setHeard] = useState("");
  if (!at || handsFree || kind === "prose") return null;
  const key = clipKey(at.store, at.aria, turn, "in");
  const play = () => {
    if (kind !== "input") return replay(turn);
    beginAction("speak", { "figaro.aria": at.aria });
    setRequest({ key });
  };
  const transcribe = async () => {
    setNote("Transcribing.");
    setHeard("");
    const got = await transcribeClip(() => traced("dictate", { "figaro.aria": at.aria }, () => retranscribe(sttUrl, key)));
    setNote(got.note ?? "");
    setHeard(got.text ?? "");
  };
  return (
    <div className="fw-inline" data-kind={kind}>
      <div className="fw-inline-bar">
        <Button variant="ghost" size="compact" className="fw-inline-btn fw-play" data-action="play" aria-label="Play your message" title="Play your message" onClick={play}>
          <Glyph glyph={glyphs["state.running"]} />
        </Button>
        <Button variant="ghost" size="compact" className="fw-inline-btn" data-action="retranscribe" aria-label="Re-transcribe" title="Re-transcribe" onClick={() => void transcribe()}>
          <Glyph glyph={glyphs["transcript.result"]} />
        </Button>
      </div>
      {kind === "input" && <PlayerIsland className="fw-inline-player" request={request} src={(k) => withSession(audioKeyUrl(audioUrl, k))} />}
      {note && (
        <p className="fw-inline-note" role="status">
          {note}
        </p>
      )}
      {heard && (
        <div className="fw-inline-heard">
          <span className="fw-inline-heard-label">Heard</span>
          <p className="fw-inline-heard-text">
            <Plain text={heard} />
          </p>
          <Button
            variant="outline"
            className="fw-use"
            data-action="use"
            onClick={() => {
              setDraft((prev) => joinDictation(prev, heard));
              setHeard("");
            }}
          >
            Use
          </Button>
        </div>
      )}
    </div>
  );
}
