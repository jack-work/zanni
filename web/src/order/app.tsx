import { useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Button, useTick } from "zanni-react";
import { EntrySheet } from "./entry-sheet";
import { RoleSection, useRoleQueue } from "./role-section";
import { ariaName } from "./roles";
import { scoped, type PageContext } from "./rows";
import { linkAtom, openEntryAtom, orderClientAtom, orderRouteAtom, rolesAtom, treeStateAtom, type Link } from "./state";

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

function Body({ page }: { page: PageContext }) {
  const client = useAtomValue(orderClientAtom);
  const tree = useAtomValue(treeStateAtom);
  const roles = useAtomValue(rolesAtom);
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
  if (!tree.ready && roles.length === 0) return <p className="ord-note">{tree.error ? "Could not read the roles: " + tree.error : "Loading roles…"}</p>;
  if (roles.length === 0) return <p className="ord-note">No role forms are visible to you.</p>;
  return (
    <div className="ord-roles" data-field="roles">
      {roles.map((role) => (
        <RoleSection key={role.id} client={client} role={role} page={page} />
      ))}
    </div>
  );
}

export function App() {
  const link = useAtomValue(linkAtom);
  const tree = useAtomValue(treeStateAtom);
  const route = useAtomValue(orderRouteAtom);
  const open = useSetAtom(openEntryAtom);
  const now = useTick(30_000);
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
