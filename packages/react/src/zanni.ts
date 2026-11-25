import nodiRaw from "../../../assets/nodi/nodi.js";
import type { NodiApi } from "./nodi-types";

export const nodi = nodiRaw as NodiApi;
export type * from "./nodi-types";
