import type { CharterRole, Mismatch } from "./charter";

export function fanoutText(role: CharterRole, drawn: number | undefined): string {
  const parts: string[] = [];
  if (drawn !== undefined) parts.push(drawn === 1 ? "1 child" : drawn + " children");
  if (role.fanout.min !== undefined) parts.push("min " + role.fanout.min);
  if (role.fanout.max !== undefined) parts.push("max " + role.fanout.max);
  if (role.fanout.quota !== undefined) parts.push("quota " + role.fanout.quota);
  return parts.join(" · ");
}

export function hasLimits(role: CharterRole): boolean {
  return role.fanout.min !== undefined || role.fanout.max !== undefined || role.fanout.quota !== undefined;
}

export function mismatchText(m: Mismatch): string {
  const under = m.drawnUnder.length > 0 ? "drawn under " + m.drawnUnder.join(" and ") : "drawn outside the command";
  return under + ", charter says " + m.declaredName;
}
