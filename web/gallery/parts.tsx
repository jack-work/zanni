import { Provider, createStore, useAtomValue } from "jotai";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AriaClient } from "figaro-forms/aria";
import {
  ActionBar,
  BlockView,
  Button,
  ButtonGroup,
  Composer,
  Fold,
  FigaroSays,
  Glyph,
  Hints,
  LatestPill,
  Pane,
  Pill,
  PillPair,
  Pit,
  PitList,
  PitRow,
  Plain,
  QueueBoard,
  QueueList,
  Sheet,
  Shell,
  Tray,
  Tree,
  TranscriptContext,
  TurnView,
  glyphs,
  nodi,
  type ButtonSize,
  type ButtonVariant,
  type DeploysResponse,
  type PitSnap,
  type ShellHosts,
  type TreeNodeData,
} from "zanni-react";
import { turnsAtom } from "zanni-react/jotai";
import ariaMock from "../../examples/aria-mock.js";
import deploys from "../test/fixtures/deploys.json";
import type { AriaMock } from "./stage";

export interface Part {
  readonly name: string;
  readonly group: string;
  readonly width: number;
  readonly height: number;
  readonly note?: string;
  readonly view: () => ReactNode;
}

const noop = () => undefined;
const VARIANTS: readonly ButtonVariant[] = ["outline", "quiet", "ghost", "accent"];
const SIZES: readonly ButtonSize[] = ["default", "compact"];

function Stage({ children }: { children: ReactNode }) {
  return <div className="gallery-part">{children}</div>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery-row">
      <span className="gallery-row-label">{label}</span>
      {children}
    </div>
  );
}

function Buttons() {
  return (
    <Stage>
      {SIZES.map((size) => (
        <Row key={size} label={size}>
          {VARIANTS.map((variant) => (
            <Button key={variant} size={size} variant={variant}>
              {variant}
            </Button>
          ))}
        </Row>
      ))}
      <Row label="disabled">
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant} disabled>
            {variant}
          </Button>
        ))}
      </Row>
      <Row label="group">
        <ButtonGroup label="Sample">
          <Button variant="outline">New</Button>
          <Button variant="outline">Fork</Button>
          <Button variant="outline">Tree</Button>
        </ButtonGroup>
      </Row>
    </Stage>
  );
}

function Pills() {
  return (
    <Stage>
      <Row label="pill">
        <Pill glyph={glyphs.attach} label="Attach" />
        <Pill glyph={glyphs.voice} label="Dictate" pressed />
        <Pill glyph={glyphs.send} label="Send" disabled />
      </Row>
      <Row label="pair">
        <PillPair label="Command and send">
          <Pill glyph={glyphs["pit.command"]} label="Command" />
          <Pill glyph={glyphs.send} label="Send" />
        </PillPair>
      </Row>
      <Row label="actions">
        <ActionBar>
          <Pill glyph={glyphs["audio.play"]} label="Play" />
          <Pill glyph={glyphs.fork} label="Fork" />
        </ActionBar>
      </Row>
    </Stage>
  );
}

function Glyphs() {
  const names = ["send", "attach", "voice", "fork", "tool.ok", "tool.error", "tool.running", "thinking", "busy", "pit.queue", "pit.troupe", "pit.form", "pit.models", "audio.play", "state.running", "state.idle"] as const;
  return (
    <Stage>
      <div className="gallery-glyphs">
        {names.map((name) => (
          <span key={name} className="gallery-glyph" title={name}>
            <Glyph glyph={glyphs[name]} />
            <code>{name}</code>
          </span>
        ))}
      </div>
    </Stage>
  );
}

function Text() {
  return (
    <Stage>
      <Row label="plain">
        <Plain text={'<img src=x onerror="alert(1)"> as typed, never markup'} />
      </Row>
      {nodi.blocks("# Findings\n\nThe cause is a stale cursor.\n\n- read backward\n- follow live\n\n```go\nfmt.Println(cursor)\n```\n\n| file | lines |\n|------|------:|\n| a.go | 12 |\n| b.go | 7 |\n").map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </Stage>
  );
}

function Rows() {
  return (
    <Stage>
      <PitList label="Row states">
        <PitRow label="Plain" onClick={noop} />
        <PitRow glyph={glyphs["pit.form"]} label="With a glyph" onClick={noop} />
        <PitRow glyph={glyphs["pit.models"]} label="With meta" meta="high" onClick={noop} />
        <PitRow glyph={glyphs["pit.queue"]} label="With a sub line" sub="three prompts waiting" onClick={noop} />
        <PitRow glyph={glyphs["pit.troupe"]} label="Current" current onClick={noop} />
        <PitRow glyph={glyphs.fork} label="Pressed" pressed onClick={noop} />
        <PitRow glyph={glyphs["pit.help"]} label="Disabled" disabled onClick={noop} />
        <PitRow glyph={glyphs["pit.form"]} label="Expanded" expanded detail={<p className="gallery-detail">The detail sits under its row.</p>} onClick={noop} />
        <PitRow label="Depth 0" depth={0} onClick={noop} />
        <PitRow label="Depth 1" depth={1} onClick={noop} />
        <PitRow label="Depth 2" depth={2} onClick={noop} />
      </PitList>
    </Stage>
  );
}

function SheetOpen() {
  return (
    <Stage>
      <p>The page under the sheet.</p>
      <Sheet open onClose={noop} title="New figaro" label="New figaro">
        <p>Pick an outfit and a first message.</p>
        <Button variant="accent">Create</Button>
      </Sheet>
    </Stage>
  );
}

function PitAt({ initial, head }: { initial: PitSnap; head?: boolean }) {
  const [snap, setSnap] = useState<PitSnap>(initial);
  return (
    <Stage>
      <p>The page under the drawer.</p>
      <Pit label="Controls" snap={snap} onSnapChange={setSnap} head={head ? <SampleComposer value="" /> : undefined}>
        <PitList label="Controls">
          <PitRow glyph={glyphs["pit.form"]} label="State" meta="high" onClick={noop} />
          <PitRow glyph={glyphs.fork} label="Fork at turn" onClick={noop} />
          <PitRow glyph={glyphs["pit.models"]} label="Outfits" onClick={noop} />
        </PitList>
      </Pit>
    </Stage>
  );
}

const ROOTS: readonly TreeNodeData[] = [
  {
    id: "node",
    label: "mock-node",
    count: 2,
    children: [
      {
        id: "arias",
        label: "arias",
        count: 4,
        children: [
          { id: "a1", label: "zanni", count: 8, role: "@zanni", mantra: "Zanni: ship ordine & Sugiyama layered layout", here: true },
          { id: "a2", label: "Frontend Engineer", count: 8, role: "@lane", mantra: "Frontend Engineer / figchat web", children: [{ id: "a3", label: "Review", count: 3, mantra: "Review: livedoc settle" }] },
          { id: "a4", label: "Backend", count: 6, mantra: "Backend: spain edge" },
        ],
      },
    ],
  },
];

function TreeSample() {
  return (
    <Stage>
      <Tree roots={ROOTS} mark={glyphs["pit.troupe.mark"]} current="a1" defaultOpen={() => true} label="Troupe" />
    </Stage>
  );
}

function SampleComposer({ value: initial, prompt, hints, tray, running }: { value: string; prompt?: string; hints?: ReactNode; tray?: ReactNode; running?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={noop}
      sendLabel={running ? "Steer" : "Send"}
      sendGlyph={running ? glyphs.steering : glyphs.send}
      placeholder={running ? "Steer figaro" : "Message"}
      attach={{ glyph: glyphs.attach, label: "Attach" }}
      command={{ glyph: glyphs["pit.command"], label: "Command" }}
      prompt={prompt}
      mode={prompt ? "command" : undefined}
      hints={hints}
      tray={tray}
      running={running}
    />
  );
}

function ComposerStates() {
  const chips = [
    { key: "fork", label: "fork", help: "Branch a conversation" },
    { key: "forward", label: "forward", help: "Undo a back", off: "nothing to redo" },
  ];
  return (
    <Stage>
      <SampleComposer value="" />
      <SampleComposer value="A draft that is typed but not yet sent" />
      <SampleComposer value="fo" prompt=":" hints={<Hints chips={chips} onPick={noop} usage="fork [turn]" />} />
      <SampleComposer
        value="what do these show?"
        tray={
          <Tray
            items={[
              { key: "a", name: "screenshot.png", kind: "Photo", size: "180 KB", status: "uploading" },
              { key: "b", name: "notes.pdf", kind: "PDF", size: "892 KB", status: "ready" },
              { key: "c", name: "movie.mov", kind: "File", size: "40 MB", status: "failed", error: "attach a png, jpeg, gif, webp or heic image, or a pdf" },
            ]}
            onRemove={noop}
          />
        }
      />
      <SampleComposer value="" running />
    </Stage>
  );
}

function QueueSample({ empty }: { empty?: boolean }) {
  const rows = empty
    ? []
    : [
        { id: 5, text: "run the whole suite once more", mark: "·" },
        { id: 6, text: "then bump the version and tag it\nand say so in the notes", mark: "→" },
        { id: 7, text: "and tell the owner when it is out", mark: "·" },
      ];
  return (
    <Stage>
      <QueueList rows={rows} onDrop={noop} onEdit={noop} grace={0} label="Queue" />
    </Stage>
  );
}

function BoardSample() {
  const [env, setEnv] = useState<"dev" | "prod">("dev");
  const [since, setSince] = useState<"24h" | "7d" | "14d">("7d");
  return (
    <Stage>
      <QueueBoard data={deploys as unknown as DeploysResponse} env={env} onEnv={setEnv} since={since} onSince={setSince} />
    </Stage>
  );
}

function Says() {
  return (
    <Stage>
      <FigaroSays lines={["That page is not here.", "Nothing lives at this address."]} start={0} />
    </Stage>
  );
}

function Misc() {
  return (
    <Stage>
      <Row label="latest">
        <LatestPill onClick={noop} />
      </Row>
      <Row label="fold">
        <Fold summary="Three steps" open>
          <p className="gallery-detail">The folded body.</p>
        </Fold>
        <Fold summary="Closed fold">
          <p className="gallery-detail">Hidden.</p>
        </Fold>
      </Row>
    </Stage>
  );
}

function MockTurns({ history }: { history: number }) {
  const made = useMemo(() => {
    const core = (ariaMock as AriaMock).create({ now: () => Date.now(), step: 60, history, pageBytes: 24000 });
    const client = new AriaClient({ dial: core.dial, pageBytes: 24000 });
    return { client, aria: core.ids.main, store: createStore() };
  }, [history]);
  useEffect(() => () => made.client.close(), [made]);
  return (
    <Provider store={made.store}>
      <Turns client={made.client} aria={made.aria} />
    </Provider>
  );
}

function Turns({ client, aria }: { client: AriaClient; aria: string }) {
  useEffect(() => {
    void client.peek(aria);
  }, [client, aria]);
  const turns = useAtomValue(turnsAtom(client, aria));
  return (
    <TranscriptContext value={{}}>
      <ol className="nodi-turns" aria-label="Transcript">
        {turns.slice(-3).map((t) => (
          <TurnView key={t.key} turn={t} speaking={null} fresh={false} />
        ))}
      </ol>
    </TranscriptContext>
  );
}

function ShellSample() {
  const [hosts, setHosts] = useState<ShellHosts | null>(null);
  return (
    <>
      <Shell
        header={{ mark: <span>fx</span>, identity: <span>src/app.go</span>, nav: <a href="#history">History</a> }}
        left={{ id: "files", label: "files", defaultOpen: true, defaultWidth: 220 }}
        storage="gallery"
        hosts={setHosts}
      />
      {hosts && createPortal(<p className="gallery-detail">The main column.</p>, hosts.main)}
      {hosts && createPortal(<p className="gallery-detail">The files pane.</p>, hosts.left)}
    </>
  );
}

function PaneSample() {
  const [width, setWidth] = useState(240);
  return (
    <Stage>
      <Pane id="gallery-pane" label="Arias" open width={width} onWidth={setWidth} form="docked">
        <p className="gallery-detail">A docked pane, resizable by its edge.</p>
      </Pane>
    </Stage>
  );
}

export const parts: readonly Part[] = [
  { name: "button", group: "Controls", width: 390, height: 260, note: "variants by size, disabled, a group", view: Buttons },
  { name: "pill", group: "Controls", width: 390, height: 190, note: "glyph pills, a pair, an action bar", view: Pills },
  { name: "glyph", group: "Controls", width: 390, height: 300, note: "the glyph table, centred by ink", view: Glyphs },
  { name: "text", group: "Text", width: 390, height: 460, note: "Plain and one markdown block", view: Text },
  { name: "rows", group: "Lists", width: 390, height: 520, note: "every row state", view: Rows },
  { name: "tree", group: "Lists", width: 390, height: 260, note: "the pager tree over a small troupe", view: TreeSample },
  { name: "queue-list", group: "Lists", width: 390, height: 300, note: "queued prompts with edit and drop", view: () => <QueueSample /> },
  { name: "queue-list-empty", group: "Lists", width: 390, height: 120, note: "nothing waiting", view: () => <QueueSample empty /> },
  { name: "sheet", group: "Surfaces", width: 390, height: 420, note: "bottom sheet open over a page", view: SheetOpen },
  { name: "pit-part-closed", group: "Surfaces", width: 390, height: 844, note: "the drawer closed with a head", view: () => <PitAt initial="closed" head /> },
  { name: "pit-part-half", group: "Surfaces", width: 390, height: 844, note: "half height with a head", view: () => <PitAt initial="half" head /> },
  { name: "pit-part-full", group: "Surfaces", width: 390, height: 844, note: "full height with a head", view: () => <PitAt initial="full" head /> },
  { name: "pane", group: "Surfaces", width: 640, height: 240, note: "a docked pane", view: PaneSample },
  { name: "shell", group: "Surfaces", width: 900, height: 360, note: "page chrome with a left pane", view: ShellSample },
  { name: "composer", group: "Composer", width: 390, height: 640, note: "empty, with a draft, command mode, with a tray, running", view: ComposerStates },
  { name: "transcript", group: "Transcript", width: 390, height: 760, note: "the last three turns of the mock aria", view: () => <MockTurns history={6} /> },
  { name: "queue-board", group: "Boards", width: 960, height: 520, note: "the deploy board over web/test/fixtures/deploys.json", view: BoardSample },
  { name: "figaro-says", group: "Boards", width: 390, height: 260, note: "the 404 head and bubble", view: Says },
  { name: "misc", group: "Controls", width: 390, height: 220, note: "Latest pill and Fold", view: Misc },
];
