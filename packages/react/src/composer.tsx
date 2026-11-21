import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./button";
import { Strip, type StripProps } from "./strip";
import { useLinger } from "./motion";

export const COMPOSER_MAX_LINES = 5;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<unknown>;
  label?: string;
  placeholder?: string;
  sendLabel: string;
  sendDisabled?: boolean;
  running?: boolean;
  strip?: Omit<StripProps, "leaving"> | null;
  stripActions?: ReactNode;
  accessory?: ReactNode;
  focusTick?: number;
  heightVar?: string;
  className?: string;
  inputClassName?: string;
  sendClassName?: string;
}

export function useCoarsePointer(): boolean {
  return useMemo(() => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches, []);
}

export function useSizeVar(ref: { current: HTMLElement | null }, name: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty(name, Math.ceil(el.getBoundingClientRect().height) + "px");
    write();
    if (typeof ResizeObserver === "undefined") return () => root.style.removeProperty(name);
    const watch = new ResizeObserver(write);
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name]);
}

export function Composer(props: ComposerProps) {
  const { value, onChange, onSubmit, label = "Message", placeholder, sendLabel, sendDisabled, running, strip, stripActions, accessory, focusTick, heightVar = "--zr-composer-h", className, inputClassName, sendClassName } = props;
  const form = useRef<HTMLFormElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const coarse = useCoarsePointer();
  useSizeVar(form, heightVar);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el || (window.CSS?.supports && window.CSS.supports("field-sizing", "content"))) return;
    el.rows = Math.max(1, Math.min(COMPOSER_MAX_LINES, value.split("\n").length));
  }, [value]);

  useEffect(() => {
    if (focusTick) input.current?.focus({ preventScroll: true });
  }, [focusTick]);

  const onKey = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key !== "Enter" || ev.shiftKey || ev.nativeEvent.isComposing || coarse) return;
    ev.preventDefault();
    void onSubmit();
  };

  const shown = useLinger(!!strip);
  const frozen = useRef(strip);
  if (strip) frozen.current = strip;
  const swap = useRef({ label: sendLabel, swapped: false });
  if (swap.current.label !== sendLabel) swap.current = { label: sendLabel, swapped: true };

  return (
    <form
      ref={form}
      className={["zr-composer", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-running={running ? "" : undefined}
      onSubmit={(ev) => {
        ev.preventDefault();
        void onSubmit();
      }}
    >
      {shown.mounted && frozen.current && (
        <Strip {...frozen.current} leaving={shown.leaving}>
          {frozen.current.kind === "running" ? stripActions : null}
        </Strip>
      )}
      <div className="zr-compose-row">
        <textarea
          ref={input}
          className={["zr-input", inputClassName].filter(Boolean).join(" ")}
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(ev) => onChange(ev.target.value)}
          onKeyDown={onKey}
        />
        {accessory}
        <Button variant="accent" type="submit" className={["zr-send", sendClassName].filter(Boolean).join(" ")} disabled={sendDisabled}>
          <span className={swap.current.swapped ? "zr-swap" : undefined} key={sendLabel}>
            {sendLabel}
          </span>
        </Button>
      </div>
    </form>
  );
}
