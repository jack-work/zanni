import { useAtomValue } from "jotai";
import { attendedRunningAtom, linkAtom } from "./state/aria";
import { AriaView } from "./components/aria-view";
import { Roster } from "./components/roster";
import { TopBar } from "./components/topbar";
import { attendedAtom, routeAtom, routeKindAtom } from "./state/route";

function ListHint() {
  return (
    <main className="fw-main" tabIndex={-1}>
      <h1 className="fw-h1">figaro web</h1>
      <p className="fw-note">Pick an aria to attend.</p>
    </main>
  );
}

function NoStore({ store }: { store: string }) {
  return (
    <main className="fw-main" tabIndex={-1}>
      <a className="fw-back" href="#/">
        Arias
      </a>
      <h1 className="fw-h1">figaro web</h1>
      <p className="fw-note">No such store: {store}</p>
    </main>
  );
}

export function App() {
  const link = useAtomValue(linkAtom);
  const kind = useAtomValue(routeKindAtom);
  const attended = useAtomValue(attendedAtom);
  const route = useAtomValue(routeAtom);
  const running = useAtomValue(attendedRunningAtom);
  return (
    <div className="fw" data-link={link} data-route={kind} data-running={running ? "" : undefined}>
      <TopBar />
      <div className="fw-body">
        <Roster />
        <div className="fw-pane">
          {attended ? <AriaView key={attended.store + "/" + attended.aria} attended={attended} /> : route?.aria ? <NoStore store={route.store} /> : <ListHint />}
        </div>
      </div>
    </div>
  );
}
