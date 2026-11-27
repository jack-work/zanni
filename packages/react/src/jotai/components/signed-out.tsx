import { Button } from "../../index";
import { useAtomValue } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { clientAtom } from "../state/route";

export function SignedOut({ client: given }: { client?: AriaClient | null }) {
  const stored = useAtomValue(clientAtom);
  const client = given === undefined ? stored : given;
  return (
    <div className="fw-signedout" role="alert">
      <p className="fw-signedout-line">Signed out: sign in again</p>
      <div className="fw-signedout-actions">
        <Button variant="outline" size="compact" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button variant="quiet" size="compact" onClick={() => client?.connection.resume()}>
          Retry
        </Button>
      </div>
    </div>
  );
}
