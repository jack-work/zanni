import { glyphs } from "figaro-forms/glyphs";

export * from "figaro-forms/glyphs";

const table = glyphs as Record<string, string>;

const MIC = "\u{1F399}\uFE0E";
const CLIP = "\u{1F4CE}\uFE0E";
const PLACEHOLDERS: Record<string, readonly string[]> = { voice: ["\u266B"], attach: ["\u275D", "\u2295"] };

function named(name: "voice" | "attach", fallback: string): string {
  const got = table[name];
  return got && !PLACEHOLDERS[name]!.includes(got) ? got : fallback;
}

export const attachGlyph: string = named("attach", CLIP);

export const voiceGlyph: string = named("voice", MIC);
