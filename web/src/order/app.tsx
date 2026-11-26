import { useEffect, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Button, useTick } from "zanni-react";
import { EntrySheet } from "./entry-sheet";
import { useRoleQueue } from "./queue-section";
import { orderHash } from "./queue";
import { ariaName } from "./roles";
import { scoped, type PageContext } from "./rows";
import { Topologies } from "./seats";
import { carryCentralAtom, linkAtom, openEntryAtom, orderClientAtom, orderRouteAtom, treeStateAtom, viewAtom, type Link, type MissingWhy } from "./state";

const LINK_TEXT: Record<Link, string> = {
  live: "live",
  connecting: "connecting",
  offline: "offline, retrying",
  signedout: "signed out",
  closed: "closed",
  detached: "no door",
};

function Detail({ page }: { page: PageContext }) {
  const client = useAtomValue(orderClientAtom)!;
  const { route } = page;
  const open = useSetAtom(openEntryAtom);
  const { form, entries } = useRoleQueue(client, route.role ?? "");
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const shown = route.role && route.entry ? byId.get(route.entry) : undefined;
  return <EntrySheet open={!!route.entry && !!route.role} entry={shown} byId={byId} settled={form.ready} ctx={scoped(page, route.role ?? "")} onClose={() => open({ role: route.role })} />;
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

function Body({ page }: { page: PageContext }) {
  const client = useAtomValue(orderClientAtom);
  const tree = useAtomValue(treeStateAtom);
  const view = useAtomValue(viewAtom);
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
  return <Topologies client={client} topology={view.topology} page={page} overrides={view.overrides} />;
}

export function App() {
  const link = useAtomValue(linkAtom);
  const tree = useAtomValue(treeStateAtom);
  const route = useAtomValue(orderRouteAtom);
  const open = useSetAtom(openEntryAtom);
  const view = useAtomValue(viewAtom);
  const carry = useSetAtom(carryCentralAtom);
  const now = useTick(30_000);
  useEffect(() => {
    if (view.central) carry();
  }, [view.central, carry]);
  const page = useMemo<PageContext>(() => ({ now, nameOf: (aria) => ariaName(tree, aria), route, openIn: (role, entry) => open({ role, entry }) }), [now, tree, route, open]);
  return (
    <div className="ord" data-link={link}>
      <header className="ord-bar">
        <span className="ord-mark">order</span>
        <h1 className="ord-h1">Work orders</h1>
        <Status link={link} />
      </header>
      <main className="ord-main" tabIndex={-1}>
        <Body page={page} />
      </main>
      {route.role && <Detail page={page} />}
    </div>
  );
}
