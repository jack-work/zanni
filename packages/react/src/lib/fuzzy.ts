const SCORE_MATCH = 16;
const GAP_START = -3;
const GAP_EXTENSION = -1;
const BONUS_BOUNDARY = SCORE_MATCH / 2;
const BONUS_NON_WORD = SCORE_MATCH / 2;
const BONUS_CAMEL_123 = BONUS_BOUNDARY + GAP_EXTENSION;
const BONUS_CONSECUTIVE = -(GAP_START + GAP_EXTENSION);
const FIRST_CHAR_MULTIPLIER = 2;
const BONUS_BOUNDARY_WHITE = BONUS_BOUNDARY + 2;
const BONUS_BOUNDARY_DELIMITER = BONUS_BOUNDARY + 1;
export const VALUE_CAP = 160;

const WHITE = 0;
const NON_WORD = 1;
const DELIMITER = 2;
const LOWER = 3;
const UPPER = 4;
const LETTER = 5;
const NUMBER = 6;

const WHITE_CHARS = " \t\n\v\f\r";
const DELIMITER_CHARS = "/,:;|";

const LOWER_RE = /^\p{Ll}$/u;
const UPPER_RE = /^\p{Lu}$/u;
const NUMBER_RE = /^\p{N}$/u;
const LETTER_RE = /^\p{L}$/u;
const SPACE_RE = /^\s$/u;
const MARK_RE = /^\p{M}+$/u;
const STROKED: Readonly<Record<string, string>> = { ø: "o", đ: "d", ł: "l", ħ: "h", ı: "i", ß: "s", ð: "d", þ: "t" };

function classOf(c: number): number {
  if (c < 128) {
    if (c >= 97 && c <= 122) return LOWER;
    if (c >= 65 && c <= 90) return UPPER;
    if (c >= 48 && c <= 57) return NUMBER;
    const ch = String.fromCharCode(c);
    if (WHITE_CHARS.includes(ch)) return WHITE;
    if (DELIMITER_CHARS.includes(ch)) return DELIMITER;
    return NON_WORD;
  }
  const ch = String.fromCodePoint(c);
  if (LOWER_RE.test(ch)) return LOWER;
  if (UPPER_RE.test(ch)) return UPPER;
  if (NUMBER_RE.test(ch)) return NUMBER;
  if (LETTER_RE.test(ch)) return LETTER;
  if (SPACE_RE.test(ch)) return WHITE;
  if (DELIMITER_CHARS.includes(ch)) return DELIMITER;
  return NON_WORD;
}

function bonusFor(prev: number, cls: number): number {
  if (cls >= NON_WORD) {
    if (prev === WHITE) return BONUS_BOUNDARY_WHITE;
    if (prev === DELIMITER) return BONUS_BOUNDARY_DELIMITER;
    if (prev === NON_WORD) return BONUS_BOUNDARY;
  }
  if ((prev === LOWER && cls === UPPER) || (prev !== NUMBER && cls === NUMBER)) return BONUS_CAMEL_123;
  if (cls === NON_WORD || cls === DELIMITER) return BONUS_NON_WORD;
  if (cls === WHITE) return BONUS_BOUNDARY_WHITE;
  return 0;
}

const BONUS = Array.from({ length: NUMBER + 1 }, (_, p) => Array.from({ length: NUMBER + 1 }, (_, c) => bonusFor(p, c)));

function lowerOf(c: number): number {
  if (c >= 65 && c <= 90) return c + 32;
  if (c < 128) return c;
  const l = String.fromCodePoint(c).toLowerCase();
  const cp = l.codePointAt(0) as number;
  return l.length === String.fromCodePoint(cp).length ? cp : c;
}

function normalized(c: number): number {
  if (c < 0xc0) return c;
  const ch = String.fromCodePoint(c);
  const stroked = STROKED[ch];
  if (stroked) return stroked.charCodeAt(0);
  const d = ch.normalize("NFD");
  const head = d.codePointAt(0) as number;
  return head < 128 && d.length > 1 && MARK_RE.test(d.slice(1)) ? head : c;
}

export const runesOf = (s: string): number[] => Array.from(s, (c) => c.codePointAt(0) as number);

export interface Found {
  start: number;
  end: number;
  score: number;
  positions: number[];
}

function scoreOf(text: readonly number[], pattern: readonly number[], from: number, to: number, withPos: boolean): { score: number; positions: number[] } {
  let pidx = 0;
  let score = 0;
  let inGap = false;
  let consecutive = 0;
  let firstBonus = 0;
  const positions: number[] = [];
  let prev = from > 0 ? classOf(text[from - 1] as number) : WHITE;
  for (let i = from; i < to; i++) {
    const raw = text[i] as number;
    const cls = classOf(raw);
    const ch = normalized(raw);
    if (ch === pattern[pidx]) {
      if (withPos) positions.push(i);
      score += SCORE_MATCH;
      let bonus = (BONUS[prev] as number[])[cls] as number;
      if (consecutive === 0) firstBonus = bonus;
      else {
        if (bonus >= BONUS_BOUNDARY && bonus > firstBonus) firstBonus = bonus;
        bonus = Math.max(bonus, firstBonus, BONUS_CONSECUTIVE);
      }
      score += pidx === 0 ? bonus * FIRST_CHAR_MULTIPLIER : bonus;
      inGap = false;
      consecutive++;
      pidx++;
    } else {
      score += inGap ? GAP_EXTENSION : GAP_START;
      inGap = true;
      consecutive = 0;
      firstBonus = 0;
    }
    prev = cls;
  }
  return { score, positions };
}

export function scanLower(text: readonly number[], pattern: readonly number[]): { score: number; start: number } | undefined {
  const m = pattern.length;
  if (m === 0) return { score: 0, start: 0 };
  let pidx = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < text.length; i++) {
    if (normalized(text[i] as number) === pattern[pidx]) {
      if (start < 0) start = i;
      if (++pidx === m) {
        end = i + 1;
        break;
      }
    }
  }
  if (start < 0 || end < 0) return undefined;
  pidx--;
  for (let i = end - 1; i >= start; i--) {
    if (normalized(text[i] as number) === pattern[pidx]) {
      if (--pidx < 0) {
        start = i;
        break;
      }
    }
  }
  return { start, score: scoreOf(text, pattern, start, end, false).score };
}

export function fuzzy(text: readonly number[], pattern: readonly number[], withPos: boolean): Found | undefined {
  const M = pattern.length;
  if (M === 0) return { start: 0, end: 0, score: 0, positions: [] };
  const N = text.length;
  if (M > N) return undefined;
  const T = new Array<number>(N);
  const B = new Int16Array(N);
  const H0 = new Int16Array(N);
  const C0 = new Int16Array(N);
  const F = new Int32Array(M);
  const maxM = pattern[0] as number;
  let pidx = 0;
  let lastIdx = 0;
  let pchar = maxM;
  let prevH0 = 0;
  let prevClass = WHITE;
  let inGap = false;
  let maxScore = 0;
  let maxScorePos = 0;
  for (let off = 0; off < N; off++) {
    let ch = text[off] as number;
    const cls = classOf(ch);
    if (cls === UPPER) ch = lowerOf(ch);
    if (ch >= 128) ch = normalized(ch);
    T[off] = ch;
    const bonus = (BONUS[prevClass] as number[])[cls] as number;
    B[off] = bonus;
    prevClass = cls;
    if (ch === pchar) {
      if (pidx < M) {
        F[pidx] = off;
        pidx++;
        pchar = pattern[Math.min(pidx, M - 1)] as number;
      }
      lastIdx = off;
    }
    if (ch === maxM) {
      const score = SCORE_MATCH + bonus * FIRST_CHAR_MULTIPLIER;
      H0[off] = score;
      C0[off] = 1;
      if (M === 1 && score > maxScore) {
        maxScore = score;
        maxScorePos = off;
        if (bonus >= BONUS_BOUNDARY) break;
      }
      inGap = false;
    } else {
      H0[off] = Math.max(prevH0 + (inGap ? GAP_EXTENSION : GAP_START), 0);
      C0[off] = 0;
      inGap = true;
    }
    prevH0 = H0[off] as number;
  }
  if (pidx !== M) return undefined;
  if (M === 1) return { start: maxScorePos, end: maxScorePos + 1, score: maxScore, positions: withPos ? [maxScorePos] : [] };

  const f0 = F[0] as number;
  const width = lastIdx - f0 + 1;
  const H = new Int16Array(width * M);
  const C = new Int16Array(width * M);
  H.set(H0.subarray(f0, lastIdx + 1));
  C.set(C0.subarray(f0, lastIdx + 1));
  for (let p = 1; p < M; p++) {
    const f = F[p] as number;
    const want = pattern[p] as number;
    const row = p * width;
    let gap: boolean = false;
    H[row + f - f0 - 1] = 0;
    for (let col = f; col <= lastIdx; col++) {
      const at = row + col - f0;
      const s2: number = (H[at - 1] as number) + (gap ? GAP_EXTENSION : GAP_START);
      let s1: number = 0;
      let consecutive = 0;
      if (want === T[col]) {
        s1 = (H[at - width - 1] as number) + SCORE_MATCH;
        let b = B[col] as number;
        consecutive = (C[at - width - 1] as number) + 1;
        if (consecutive > 1) {
          const fb = B[col - consecutive + 1] as number;
          if (b >= BONUS_BOUNDARY && b > fb) consecutive = 1;
          else b = Math.max(b, BONUS_CONSECUTIVE, fb);
        }
        if (s1 + b < s2) {
          s1 += B[col] as number;
          consecutive = 0;
        } else s1 += b;
      }
      C[at] = consecutive;
      gap = s1 < s2;
      const score = Math.max(s1, s2, 0);
      if (p === M - 1 && score > maxScore) {
        maxScore = score;
        maxScorePos = col;
      }
      H[at] = score;
    }
  }

  const positions: number[] = [];
  let j = f0;
  if (withPos) {
    let i = M - 1;
    j = maxScorePos;
    let preferMatch = true;
    for (;;) {
      const I = i * width;
      const j0 = j - f0;
      const s = H[I + j0] as number;
      const s1 = i > 0 && j >= (F[i] as number) ? (H[I - width + j0 - 1] as number) : 0;
      const s2 = j > (F[i] as number) ? (H[I + j0 - 1] as number) : 0;
      const row = i;
      if (s > s1 && (s > s2 || (s === s2 && preferMatch))) {
        positions.push(j);
        if (i === 0) break;
        i--;
      }
      preferMatch = (C[I + j0] as number) > 1 || (row + 1 < M && j < lastIdx && j + 1 >= (F[row + 1] as number) && (C[I + width + j0 + 1] as number) > 0);
      j--;
    }
  }
  return { start: j, end: maxScorePos + 1, score: maxScore, positions };
}
