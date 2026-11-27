import { useEffect, useMemo, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Button, useTick } from "zanni-react";
import { EntrySheet } from "./entry-sheet";
import { GraphPage } from "./graph-page";
import { useRoleQueue } from "./queue-detail";
import { orderHash } from "./queue";
import { ariaName } from "./roles";
import { scoped, type PageContext } from "./rows";
import { StandingNote } from "./standing";
import type { MissingWhy, Standing } from "./derive";
import { carryCentralAtom, linkAtom, openAtom, orderClientAtom, orderRouteAtom, pageAtom, treeStateAtom, type Link, type Page } from "./state";

const LINK_TEXT: Record<Link, string> = {
  live: "live",
  connecting: "connecting",
  offline: "offline, retrying",
  signedout: "signed out",
  closed: "closed",
  detached: "no door",
};

function Detail({ page, standing }: { page: PageContext; standing: Standing }) {
  const client = useAtomValue(orderClientAtom)!;
  const { route } = page;
  const open = useSetAtom(openAtom);
  const link = useAtomValue(linkAtom);
  const { form, entries } = useRoleQueue(client, route.node ?? "");
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const shown = route.node && route.entry ? byId.get(route.entry) : undefined;
  return <EntrySheet open={!!route.entry && !!route.node} entry={shown} byId={byId} settled={form.ready} standing={standing} link={link} ctx={scoped(page, route.node ?? "")} onClose={() => open({ node: route.node })} />;
}

function Status({ link }: { link: Link }) {
  return (
    <span className="ord-status" data-field="link" data-link={link}>
      {LINK_TEXT[link]}
    </span>
  );
}

const MISSING: Record<MissingWhy, string> = {
  unknown: "No role form with this id is visible to you.",
  closed: "This central command is closed to you.",
  gone: "This central command is gone.",
  unreadable: "Could not read this central command.",
  unchartered: "This form is not a chartered role.",
  queue: "This form is a queue form, not a central command.",
};

function Body({ page, shown }: { page: PageContext; shown: Page }) {
  const client = useAtomValue(orderClientAtom);
  const tree = useAtomValue(treeStateAtom);
  const { view, reads } = shown;
  const link = useAtomValue(linkAtom);
  if (!client || !tree) return <p className="ord-note">No door to figaro.</p>;
  if (link === "signedout")
    return (
      <div className="ord-note" role="alert">
        <p>Signed out: sign in again.</p>
        <Button variant="outline" size="compact" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  if (link === "closed" && view.kind === "loading")
    return (
      <div className="ord-note" role="alert" data-field="closed">
        <p>The connection is closed.</p>
        <Button variant="outline" size="compact" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  if (view.kind === "loading") return <p className="ord-note">{tree.error ? "Could not read the roles: " + tree.error : "Loading the chartered roles…"}</p>;
  if (view.kind === "none") return <p className="ord-note" data-field="none">No chartered central command is visible to you.</p>;
  if (view.kind === "missing") return <p className="ord-note" data-field="missing">{MISSING[view.why]}</p>;
  if (view.kind === "elsewhere")
    return (
      <p className="ord-note" data-field="elsewhere">
        {view.role.name} is not a central command.{" "}
        {view.role.chartered.root && (
          <a className="ord-link" href={orderHash(view.role.chartered.root)}>
            Open its central command
          </a>
        )}
      </p>
    );
  return <GraphPage client={client} view={view} reads={reads} page={page} overrides={view.overrides} />;
}

function useLastComplete(now: Page, asked: string | undefined): Page {
  const kept = useRef<{ page: Page; asked: string | undefined }>(undefined);
  if (now.complete) kept.current = { page: now, asked };
  const held = kept.current;
  const standing = held ? now.standing : "current";
  const page = !now.complete && held && (held.asked === undefined || held.asked === asked) ? held.page : now;
  return { ...page, standing };
}

export function App() {
  const link = useAtomValue(linkAtom);
  const tree = useAtomValue(treeStateAtom);
  const route = useAtomValue(orderRouteAtom);
  const open = useSetAtom(openAtom);
  const shown = useLastComplete(useAtomValue(pageAtom), route.central);
  const carry = useSetAtom(carryCentralAtom);
  const now = useTick(30_000);
  useEffect(() => {
    if (shown.view.central) carry();
  }, [shown.view.central, carry]);
  const page = useMemo<PageContext>(() => ({ now, nameOf: (aria) => ariaName(tree, aria), route, openIn: (node, entry) => open({ node, entry }) }), [now, tree, route, open]);
  return (
    <div className="ord" data-link={link}>
      <header className="ord-bar">
        <span className="ord-mark">order</span>
        <h1 className="ord-h1">Work orders</h1>
        <Status link={link} />
      </header>
      <main className="ord-main" data-standing={shown.standing} tabIndex={-1}>
        {shown.view.kind !== "loading" && link !== "signedout" && <StandingNote standing={shown.standing} link={link} />}
        <Body page={page} shown={shown} />
      </main>
      {route.node && route.entry && route.node.startsWith("@") && <Detail page={page} standing={shown.standing} />}
    </div>
  );
}
