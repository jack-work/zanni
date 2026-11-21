export interface SttReply {
  text?: string;
  duration_ms?: number;
  audio_id?: string;
}

export class SttError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function reply(res: Response): Promise<SttReply> {
  const text = await res.text();
  let json: (SttReply & { error?: string }) | null = null;
  try {
    json = JSON.parse(text) as SttReply & { error?: string };
  } catch {
    json = null;
  }
  if (res.status >= 200 && res.status < 300 && json) return json;
  throw new SttError(json && json.error ? String(json.error) : "HTTP " + res.status, res.status);
}

export function dictate(url: string, f: typeof fetch = (...a) => window.fetch(...a)): (blob: Blob, target: string) => Promise<SttReply> {
  return async (blob, target) =>
    reply(
      await f(url + "?aria=" + encodeURIComponent(target), {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      }),
    );
}

export function retranscribe(url: string, key: string, f: typeof fetch = (...a) => window.fetch(...a)): Promise<SttReply> {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return f(url.replace(/\/$/, "") + "/key/" + path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }).then(reply);
}
