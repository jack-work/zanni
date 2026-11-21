import { useAtomValue } from "jotai";
import { useSyncExternalStore } from "react";
import { PitProvider, useViewport } from "zanni-react";
import { AriaView, BoundPit, NewFigaro, attendedAtom, attendedRunningAtom, audioSessionAtom, BoundSheet as Sheet, linkAtom, micAtom, Roster, routeAtom, routeKindAtom, StatusBar } from "zanni-react/jotai";

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
  const mic = useAtomValue(micAtom);
  const session = useAtomValue(audioSessionAtom);
  useViewport();
  const phase = useSyncExternalStore(
    (fn) => session.subscribe(fn),
    () => session.phase(),
  );
  return (
    <PitProvider>
      <div className="fw zr-shell" data-link={link} data-route={kind} data-running={running ? "" : undefined} data-mic={mic.state} data-audio={phase}>
        <StatusBar />
        <div className="fw-body">
          <Roster />
          <div className="fw-pane">
            {attended ? <AriaView key={attended.store + "/" + attended.aria} attended={attended} /> : route?.aria ? <NoStore store={route.store} /> : <ListHint />}
          </div>
        </div>
        <Sheet />
        <NewFigaro />
        <BoundPit />
      </div>
    </PitProvider>
  );
}
