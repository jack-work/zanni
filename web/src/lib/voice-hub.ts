import type { AudioSession } from "./audio-session";
import type { SpeechChunk, SpeechSession, SpeechStart, SpeechTransport, VocePlayer, VoceApi } from "./nodi-types";

export interface SpokenNode {
  readonly turn: number;
  readonly node: number;
  readonly chars: number | undefined;
}

export interface HubDeps {
  readonly doc: Document;
  readonly voce: VoceApi;
  readonly session: AudioSession;
  audioSrc(key: string): string;
  audioStatus(key: string): Promise<number>;
  speaking(s: SpokenNode | null): void;
  slot(turn: number, node: number): HTMLElement | null;
  firstSlot(turn: number): HTMLElement | null;
  wait(ms: number): Promise<void>;
}

const SLOT_WAIT_MS = 3000;
const SLOT_POLL_MS = 40;
const ACTIVE = new Set(["live", "draining", "playing", "loading"]);

class Feed {
  player: VocePlayer | null = null;
  cancelled = false;
  ended = false;
  chain: Promise<void>;
  open!: () => void;

  constructor(readonly turn: number) {
    const gate = new Promise<void>((resolve) => {
      this.open = resolve;
    });
    this.chain = gate;
  }

  then(fn: () => void | Promise<void>): void {
    this.chain = this.chain.then(() => (this.cancelled ? undefined : fn())).catch(() => undefined);
  }
}

export class VoiceHub {
  private readonly feeds = new Map<number, Feed>();
  private readonly conn: SpeechSession;
  private spoken: number | null = null;
  private closed = false;

  constructor(
    private readonly deps: HubDeps,
    private readonly aria: string,
    private readonly store: string,
    transport: SpeechTransport,
  ) {
    this.conn = transport.open(
      { aria },
      {
        start: (e) => this.start(e),
        chunk: (c) => this.chunk(c),
        end: (e) => this.finish(e.turn, (f) => f.player?.end(e.key || "")),
        cancel: (e) => this.cancelTurn(e.turn),
        error: (e) => {
          if (e.turn !== undefined) this.failTurn(e.turn);
        },
      },
    );
  }

  voice(on: boolean): void {
    this.conn.voice(on);
    if (on) return;
    for (const feed of this.feeds.values()) {
      this.hush(feed);
      feed.player?.stop();
    }
  }

  cancel(): void {
    this.conn.cancel();
  }

  close(): void {
    this.closed = true;
    this.conn.close();
    for (const feed of this.feeds.values()) {
      feed.cancelled = true;
      feed.open();
      feed.player?.destroy();
    }
    this.feeds.clear();
    this.deps.speaking(null);
  }

  replay(turn: number): void {
    const key = this.key(turn);
    let feed = this.feeds.get(turn);
    let player = feed?.player ?? null;
    if (!player) {
      const slot = this.deps.firstSlot(turn);
      if (!slot) return;
      feed = feed ?? new Feed(turn);
      feed.open();
      player = this.mount(feed, slot);
      player.end(key);
      this.feeds.set(turn, feed);
    }
    player.play();
  }

  private key(turn: number): string {
    return this.store + "/" + this.aria + ":" + turn + "/out";
  }

  private active(turn: number): string {
    return this.aria + ":" + turn;
  }

  private mount(feed: Feed, slot: HTMLElement): VocePlayer {
    const player = this.deps.voce.create(this.deps.doc, {
      audioId: "",
      src: this.deps.audioSrc,
      status: this.deps.audioStatus,
      label: "Spoken reply",
      change: (state) => this.deps.session.clip(this.active(feed.turn), ACTIVE.has(state)),
    });
    player.el.setAttribute("data-for", String(feed.turn));
    slot.appendChild(player.el);
    feed.player = player;
    return player;
  }

  private async playerFor(feed: Feed, node: number): Promise<VocePlayer | null> {
    if (feed.player) return feed.player;
    for (let waited = 0; waited <= SLOT_WAIT_MS; waited += SLOT_POLL_MS) {
      if (feed.cancelled || this.closed) return null;
      const slot = this.deps.slot(feed.turn, node);
      if (slot) return this.mount(feed, slot);
      await this.deps.wait(SLOT_POLL_MS);
    }
    return null;
  }

  private start(e: SpeechStart): void {
    const old = this.feeds.get(e.turn);
    if (old && !old.ended && !old.cancelled) return;
    old?.player?.destroy();
    const feed = new Feed(e.turn);
    this.feeds.set(e.turn, feed);
    this.deps.session.arrive({ key: this.active(e.turn), release: () => feed.open() });
    feed.then(async () => {
      const player = await this.playerFor(feed, e.node);
      if (!player || feed.cancelled) return;
      player.start({ format: e.format, rate: e.rate, bits: e.bits, channels: e.channels });
    });
  }

  private chunk(c: SpeechChunk): void {
    const feed = this.feeds.get(c.turn);
    if (!feed) return;
    feed.then(() => {
      if (!feed.player) return;
      this.spoken = c.turn;
      this.deps.speaking({ turn: c.turn, node: c.node, chars: c.chars });
      feed.player.push(c.pcm);
    });
  }

  private finish(turn: number, fn: (f: Feed) => void): void {
    const feed = this.feeds.get(turn);
    if (!feed) return;
    feed.ended = true;
    feed.then(() => {
      this.quiet(turn);
      fn(feed);
    });
  }

  private hush(feed: Feed): void {
    feed.ended = true;
    feed.cancelled = true;
    feed.open();
    this.deps.session.withdraw(this.active(feed.turn));
    this.quiet(feed.turn);
  }

  private silence(feed: Feed): void {
    this.hush(feed);
    if (feed.player) {
      feed.player.stop();
      feed.player.end("");
    }
  }

  private cancelTurn(turn: number): void {
    const feed = this.feeds.get(turn);
    if (feed) this.silence(feed);
  }

  private failTurn(turn: number): void {
    const feed = this.feeds.get(turn);
    if (!feed) return;
    this.hush(feed);
    feed.player?.fail();
  }

  private quiet(turn: number): void {
    if (this.spoken !== turn) return;
    this.spoken = null;
    this.deps.speaking(null);
  }
}
