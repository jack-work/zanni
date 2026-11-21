import nodiRaw from "../../../assets/nodi/nodi.js";
import speechRaw from "../../../assets/figchat/speech.js";
import voceRaw from "../../../assets/voce/voce.js";
import type { NodiApi, SpeechApi, VoceApi } from "./nodi-types";

export const nodi = nodiRaw as NodiApi;
export const speech = speechRaw as SpeechApi;
export const voce = voceRaw as VoceApi;
export type * from "./nodi-types";
