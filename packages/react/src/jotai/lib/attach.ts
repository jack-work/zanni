import { sessionHeaders } from "../../session";

export const MAX_FILES = 8;
export const MAX_IMAGES = 4;
export const MAX_BYTES = 10 * 1024 * 1024;
export const ID_TTL_MS = 15 * 60 * 1000;
export const ID_MARGIN_MS = 30 * 1000;

export const ACCEPT = "image/*,application/pdf,.pdf,.heic,.heif";

export interface Uploaded {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly bytes: number;
  readonly images: number;
  readonly pages?: number;
  readonly text?: number;
}

export class AttachError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function replyOf(res: Response): Promise<Uploaded> {
  const text = await res.text();
  let json: (Partial<Uploaded> & { error?: string }) | null = null;
  try {
    json = JSON.parse(text) as Partial<Uploaded> & { error?: string };
  } catch {
    json = null;
  }
  if (res.status === 200 && json && typeof json.id === "string") return json as Uploaded;
  throw new AttachError(json && json.error ? String(json.error) : "HTTP " + res.status, res.status);
}

export function uploadFile(url: string, file: File, f: typeof fetch = (...a) => window.fetch(...a)): Promise<Uploaded> {
  return f(url, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: sessionHeaders({ Accept: "application/json", "Content-Type": file.type || "application/octet-stream", "X-Attach-Name": encodeURIComponent(file.name || "attachment") }),
    body: file,
  }).then(replyOf, () => {
    throw new AttachError("network", 0);
  });
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function kindWord(kind: string): string {
  return kind === "pdf" ? "PDF" : kind === "image" ? "Photo" : "File";
}

export interface Slot {
  readonly status: "uploading" | "ready" | "failed";
  readonly images: number;
  readonly at: number;
}

export function imagesIn(items: readonly Slot[]): number {
  return items.reduce((n, i) => (i.status === "failed" ? n : n + i.images), 0);
}

export function problemWith(file: { name: string; size: number }, have: number): string {
  if (have >= MAX_FILES) return "A message carries at most " + MAX_FILES + " attachments.";
  if (file.size > MAX_BYTES) return file.name + " is over " + MAX_BYTES / (1024 * 1024) + " MiB.";
  if (file.size === 0) return file.name + " is empty.";
  return "";
}

export function stale(item: Slot, now: number): boolean {
  return now - item.at >= ID_TTL_MS - ID_MARGIN_MS;
}

export function attachUrlOf(url: string, base: string = document.baseURI): string {
  return new URL(url, base).toString();
}
