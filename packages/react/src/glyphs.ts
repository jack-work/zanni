import { glyphs } from "figaro-forms/glyphs";

export * from "figaro-forms/glyphs";

export const attachGlyph: string = (glyphs as Record<string, string>).attach ?? glyphs.quote;

export const voiceGlyph: string = (glyphs as Record<string, string>).voice ?? "♫";
