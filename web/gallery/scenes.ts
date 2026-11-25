import { attachmentsAtom, commandAtom, draftAtom, keyOf } from "zanni-react/jotai";
import { pitSnapAtom, pitViewAtom } from "../../packages/react/src/jotai/state/pit";
import orders from "../test/fixtures/orders.json";
import { STORE, clientOf, go, type MockCore, type Scene, type Store } from "./stage";

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function find<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const el = root.querySelector<T>(selector);
    if (el) return el;
    await pause(30);
  }
  throw new Error("scene: nothing matches " + selector);
}

async function press(root: ParentNode, selector: string): Promise<void> {
  (await find<HTMLElement>(root, selector)).click();
  await pause(120);
}

async function leaveBottom(root: ParentNode): Promise<void> {
  const scroller = await find<HTMLElement>(root, "[data-zr-scroll]");
  const end = () => scroller.scrollHeight - scroller.clientHeight;
  for (let still = 0; still < 6; ) {
    await pause(50);
    still = Math.abs(scroller.scrollTop - end()) < 2 ? still + 1 : 0;
  }
  scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -400, bubbles: true }));
  scroller.scrollTop = end() / 2;
  await pause(400);
  if (end() - scroller.scrollTop < 96) throw new Error("scene: the transcript did not stay away from the bottom");
}

const aria = (core: MockCore) => core.ids.main;
const draftKey = (core: MockCore) => keyOf(STORE, aria(core));

function queued(core: MockCore, texts: string[]): void {
  const items: Record<string, { state: string; text: string }> = {};
  texts.forEach((text, i) => (items[String(i + 5)] = { state: "queued", text }));
  core.setQueue(aria(core), { epoch: "e1", len: texts.length, order: texts.map((_, i) => i + 5), items });
}

async function running(core: MockCore, store: Store, text: string): Promise<void> {
  await clientOf(store).qua(aria(core), text);
}

function open(snap: "half" | "full", view: "list" | "state" | "tree" | "asks" | "queue" | "recent" | "outfits" = "list"): (core: MockCore, store: Store) => void {
  return (_core, store) => {
    store.set(pitSnapAtom, snap);
    store.set(pitViewAtom, view);
  };
}

const QUEUE = ["run the whole suite once more", "then bump the version and tag it", "and tell the owner when it is out"];

export const scenes: Scene[] = [
  {
    name: "idle",
    frame: "phone",
    note: "an attended aria at rest, the transcript at its end",
    setup: (core) => go(aria(core)),
  },
  {
    name: "running-steer",
    frame: "phone",
    note: "a running turn with a steer queued behind it",
    mock: { steps: 22 },
    setup: async (core, store) => {
      go(aria(core));
      await running(core, store, "run the tests");
      await clientOf(store).qua(aria(core), "also check the docs");
    },
  },
  {
    name: "queue-shut",
    frame: "phone",
    note: "three queued prompts, the pile shut above the composer",
    mock: { steps: 6 },
    setup: async (core, store) => {
      go(aria(core));
      await running(core, store, "run the tests");
      queued(core, QUEUE);
    },
  },
  {
    name: "queue-open",
    frame: "phone",
    note: "the same pile opened",
    mock: { steps: 6 },
    setup: async (core, store) => {
      go(aria(core));
      await running(core, store, "run the tests");
      queued(core, QUEUE);
    },
    after: (_core, _store, root) => press(root, ".fw-pile-head"),
  },
  {
    name: "pit-half",
    frame: "phone",
    note: "the drawer at half height on the controls",
    setup: (core, store) => {
      go(aria(core));
      open("half")(core, store);
    },
  },
  {
    name: "pit-controls",
    frame: "phone",
    note: "the drawer full, the controls list",
    setup: (core, store) => {
      go(aria(core));
      open("full")(core, store);
    },
  },
  {
    name: "pit-tree",
    frame: "phone",
    note: "the drawer full on the troupe tree",
    setup: (core, store) => {
      go(aria(core));
      open("full", "tree")(core, store);
    },
  },
  {
    name: "state-edit",
    frame: "phone",
    note: "the state view with a key opened for editing",
    setup: (core, store) => {
      go(aria(core));
      open("full", "state")(core, store);
    },
    after: (_core, _store, root) => press(root, '.fw-formtree .zr-tree-row[data-id="mantra"]'),
  },
  {
    name: "command-chips",
    frame: "phone",
    note: "command mode with the suggestion chips",
    setup: (core, store) => {
      go(aria(core));
      store.set(commandAtom(draftKey(core)), { on: true, line: "fo", why: "", shut: false });
    },
  },
  {
    name: "attachment-uploading",
    frame: "phone",
    note: "a picture and a pdf in the tray, one still uploading",
    setup: (core, store) => {
      go(aria(core));
      const at = Date.now();
      store.set(attachmentsAtom(draftKey(core)), [
        { key: "a1", file: new File([""], "screenshot.png"), name: "screenshot.png", kind: "image", bytes: 184320, id: "", error: "", status: "uploading", images: 1, at },
        { key: "a2", file: new File([""], "notes.pdf"), name: "notes.pdf", kind: "pdf", bytes: 913408, id: "x", error: "", status: "ready", images: 0, at },
      ]);
      store.set(draftAtom(draftKey(core)), "what do these show?");
    },
  },
  {
    name: "signed-out",
    frame: "desktop",
    note: "the session has lapsed",
    signedOut: true,
    setup: () => go(),
  },
  {
    name: "fork-of",
    frame: "phone",
    note: "a fork after its first turn, the status bar and the turn naming where it came from",
    mock: { step: 1 },
    setup: async (core, store) => {
      const client = clientOf(store);
      const forked = await client.peek(aria(core)).fork({ atTurn: 3 });
      await client.qua(forked.alternative, "[plain] carry on from here");
      while (core.running(forked.alternative)) await pause(20);
      go(forked.alternative);
    },
  },
  {
    name: "asks",
    frame: "phone",
    note: "the asks list in the drawer",
    setup: (core, store) => {
      core.setOrders(orders);
      go(aria(core));
      open("full", "asks")(core, store);
    },
  },
  {
    name: "long-away",
    frame: "phone",
    note: "a long transcript scrolled off the bottom, with Latest",
    mock: { history: 80 },
    setup: (core) => go(aria(core)),
    after: (_core, _store, root) => leaveBottom(root),
  },
  {
    name: "desktop-roster",
    frame: "desktop",
    note: "wide: the roster beside an attended aria",
    setup: (core) => go(aria(core)),
  },
];
