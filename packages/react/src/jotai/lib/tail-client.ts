import { AriaClient, type Page, type ReadRequest } from "figaro-forms/aria";
import type { ConnectionState } from "figaro-forms";

export const CATCH_UP_PAGES = 4;

type Read = Omit<ReadRequest, "figaro_id">;

export class TailClient extends AriaClient {
  private readonly ahead = new Map<string, number>();

  override async read(aria: string, req: Read = {}): Promise<Page> {
    if (req.at === undefined || req.backward) return super.read(aria, req);
    const page = await super.read(aria, req);
    if (!page.more.after) {
      this.ahead.delete(aria);
      return page;
    }
    const pages = (this.ahead.get(aria) ?? 0) + 1;
    if (pages < CATCH_UP_PAGES || req.at.node !== 0) {
      this.ahead.set(aria, pages);
      return page;
    }
    this.ahead.delete(aria);
    return super.read(aria, { backward: true, ...(req.limit ? { limit: req.limit } : {}) });
  }

  protected override connected(generation: number): void {
    this.ahead.clear();
    super.connected(generation);
  }

  protected override disconnected(state: ConnectionState): void {
    this.ahead.clear();
    super.disconnected(state);
  }
}
