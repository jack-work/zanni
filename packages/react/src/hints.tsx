import { Plain } from "./text";

export interface Chip {
  readonly key: string;
  readonly label: string;
  readonly help?: string;
  readonly off?: string;
}

export interface HintsProps {
  chips: readonly Chip[];
  onPick: (key: string) => void;
  usage?: string;
  help?: string;
  refusal?: string;
}

export function Hints({ chips, onPick, usage, help, refusal }: HintsProps) {
  if (!chips.length && !usage && !refusal) return null;
  return (
    <div className="zr-hints" role="group" aria-label="Completions">
      {chips.length > 0 && (
        <div className="zr-chips">
          {chips.map((c) => (
            <button key={c.key} type="button" className="zr-chip" title={c.off || c.help || c.label} {...(c.off ? { "data-off": "" } : {})} onMouseDown={(ev) => ev.preventDefault()} onClick={() => onPick(c.key)}>
              <span>
                <Plain text={c.label} />
              </span>
              {c.help && (
                <span className="zr-chip-help">
                  <Plain text={c.help} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {refusal ? (
        <p className="zr-hint" data-refused="" role="status">
          <Plain text={refusal} />
        </p>
      ) : (
        usage && (
          <p className="zr-hint">
            <span className="zr-hint-usage">
              <Plain text={usage} />
            </span>
            {help && (
              <>
                {"  "}
                <Plain text={help} />
              </>
            )}
          </p>
        )
      )}
    </div>
  );
}
