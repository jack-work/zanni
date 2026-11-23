import { layoutWithLines, measureNaturalWidth, prepareWithSegments } from "@chenglou/pretext";

export const engine = {
  name: "figchat:pretext",
  prepare: (text: string, font: string) => prepareWithSegments(text, font),
  lines: (prepared: ReturnType<typeof prepareWithSegments>, width: number, lineHeight: number) => layoutWithLines(prepared, width, lineHeight).lines.map((l) => l.text),
  width: (prepared: ReturnType<typeof prepareWithSegments>) => measureNaturalWidth(prepared),
};
