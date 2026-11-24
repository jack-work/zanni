import { Button, Glyph, PlayerIsland, Plain, audioKeyUrl, glyphs, withSession, type PlayRequest } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { clipKey, transcribeClip } from "../lib/clips";
import { joinDictation } from "../lib/mic";
import { retranscribe } from "../lib/stt";
import { beginAction, traced } from "../../trace";
import { handsFreeAtom, inquiryPlayAtom, replayAtom } from "../state/audio";
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
  const ask = useAtomValue(inquiryPlayAtom);
  const then = useRef(false);
  const mineKey = at ? clipKey(at.store, at.aria, turn, "in") : "";
  useEffect(() => {
    if (kind !== "input" || !at || !ask || ask.turn !== turn) return;
    then.current = ask.then;
    beginAction("speak", { "figaro.aria": at.aria });
    setRequest({ key: mineKey });
  }, [ask, kind, turn, at, mineKey]);
  if (!at || handsFree) return null;
  if (kind === "prose") {
    return (
      <div className="fw-output-play">
        <Button variant="ghost" size="compact" className="fw-play fw-output-btn" data-action="play" aria-label="Play reply" title="Play reply" onClick={() => replay(turn)}>
          <Glyph glyph={glyphs["audio.play"]} />
        </Button>
      </div>
    );
  }
  const key = clipKey(at.store, at.aria, turn, "in");
  const play = () => {
    if (kind !== "input") return replay(turn);
    beginAction("speak", { "figaro.aria": at.aria });
    then.current = false;
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
          <Glyph glyph={glyphs["audio.play"]} />
        </Button>
        <Button variant="ghost" size="compact" className="fw-inline-btn" data-action="retranscribe" aria-label="Re-transcribe" title="Re-transcribe" onClick={() => void transcribe()}>
          <Glyph glyph={glyphs["transcript.result"]} />
        </Button>
      </div>
      {kind === "input" && <PlayerIsland className="fw-inline-player" request={request} src={(k) => withSession(audioKeyUrl(audioUrl, k))} done={() => then.current && replay(turn)} />}
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
