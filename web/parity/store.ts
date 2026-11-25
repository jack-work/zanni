import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
const found = /data-store="([^"]+)"/.exec(page);
if (!found) throw new Error("web/index.html names no data-store for the parity runner to attend");

export const store: string = found[1]!;
