export const SESSION_HEADER = "X-Figchat-Session";
export const SESSION_PARAM = "session";

export function mintSessionId(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(new ArrayBuffer(12)));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const sessionId: string = mintSessionId();

export function sessionHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, [SESSION_HEADER]: sessionId };
}

export function withSession(url: string): string {
  const at = url.indexOf("#");
  const base = at < 0 ? url : url.slice(0, at);
  const hash = at < 0 ? "" : url.slice(at);
  const drop = base.replace(new RegExp("([?&])" + SESSION_PARAM + "=[^&]*&?"), "$1").replace(/[?&]$/, "");
  return drop + (drop.includes("?") ? "&" : "?") + SESSION_PARAM + "=" + sessionId + hash;
}

export function sessionUrl(url: URL): URL {
  const out = new URL(url.href);
  out.searchParams.set(SESSION_PARAM, sessionId);
  return out;
}

export function audioKeyUrl(audioUrl: string, key: string): string {
  return audioUrl.replace(/\/$/, "") + "/key/" + key.split("/").map(encodeURIComponent).join("/");
}
