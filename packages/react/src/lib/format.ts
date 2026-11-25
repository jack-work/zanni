export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const whole = Math.round(ms);
  if (whole < 1000) return whole + "ms";
  const tenths = Math.round(ms / 100);
  if (tenths < 100) return (tenths / 10).toFixed(1) + "s";
  const total = Math.round(ms / 1000);
  if (total < 60) return total + "s";
  const pair = (big: number, bigUnit: string, small: number, smallUnit: string): string => big + bigUnit + (small ? " " + small + smallUnit : "");
  if (total < 3600) return pair(Math.floor(total / 60), "m", total % 60, "s");
  const hours = Math.floor(total / 3600);
  if (hours < 24) return pair(hours, "h", Math.floor((total % 3600) / 60), "m");
  return pair(Math.floor(hours / 24), "d", hours % 24, "h");
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}

export function time(ms: number): string {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

export function stamp(ms: number): string {
  const d = new Date(ms);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

export function bytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

export function clip(text: string, max = Infinity): string {
  const first = text.split("\n", 1)[0] ?? "";
  const chars = [...first];
  if (chars.length <= max) return first;
  return chars.slice(0, Math.max(max - 1, 0)).join("") + "…";
}
