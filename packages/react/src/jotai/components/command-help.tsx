import { Sheet } from "../../index";
import { useAtom } from "jotai";
import { webCommandDocs } from "figaro-forms/catalog";
import { Plain } from "../../index";
import { refusalOf } from "../lib/command";
import { helpOpenAtom } from "../state/command";

const GROUPS = webCommandDocs
  .filter((c) => !c.hidden)
  .map((c) => ({ doc: c, off: refusalOf(c) }))
  .sort((a, b) => Number(!!a.off) - Number(!!b.off));

export function CommandHelp() {
  const [open, setOpen] = useAtom(helpOpenAtom);
  return (
    <Sheet open={open} onClose={() => setOpen(false)} className="fw-sheet fw-help-sheet" label="Commands" title="Commands">
      <dl className="fw-help">
        {GROUPS.map(({ doc, off }) => (
          <div key={doc.name} className="fw-help-row" {...(off ? { "data-off": "" } : {})}>
            <dt>{doc.name}</dt>
            <dd>
              <Plain text={doc.help} />
              {off && (
                <span className="fw-help-why">
                  {" "}
                  <Plain text={off} />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
