import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Pill, PillPair, type PillSpec } from "./pill";
import { Strip, type StripProps } from "./strip";
import { useLinger } from "./motion";
import { onKeyboard } from "./viewport";

export const KEYBOARD_CLOSE_SETTLE_MS = 300;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<unknown>;
  label?: string;
  placeholder?: string;
  sendLabel: string;
  sendGlyph: string;
  attach?: PillSpec;
  command?: PillSpec;
  sendDisabled?: boolean;
  running?: boolean;
  strip?: Omit<StripProps, "leaving"> | null;
  stripActions?: ReactNode;
  accessory?: ReactNode;
  grip?: ReactNode;
  focusTick?: number;
  inputRef?: Ref<HTMLTextAreaElement>;
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
  const { value, onChange, onSubmit, label = "Message", placeholder, sendLabel, sendGlyph, attach, command, sendDisabled, running, strip, stripActions, accessory, grip, focusTick, inputRef, heightVar = "--zr-composer-h", className, inputClassName, sendClassName } = props;
  const form = useRef<HTMLFormElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const typing = useRef(false);
  const coarse = useCoarsePointer();
  const grows = useMemo(() => !(window.CSS?.supports && window.CSS.supports("field-sizing", "content")), []);
  useSizeVar(form, heightVar);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el || !grows) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + "px";
  }, [value, grows]);

  const setInput = (el: HTMLTextAreaElement | null) => {
    input.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) (inputRef as { current: HTMLTextAreaElement | null }).current = el;
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onKeyboard((open) => {
      clearTimeout(timer);
      if (open) return;
      timer = setTimeout(() => {
        if (document.activeElement === input.current) input.current?.blur();
      }, KEYBOARD_CLOSE_SETTLE_MS);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, []);

  useEffect(() => {
    if (focusTick) input.current?.focus({ preventScroll: true });
  }, [focusTick]);

  const onKey = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key !== "Enter" || ev.shiftKey || ev.nativeEvent.isComposing || ev.keyCode === 229 || coarse) return;
    ev.preventDefault();
    submit();
  };

  const submit = () => {
    const keep = typing.current || document.activeElement === input.current;
    typing.current = false;
    if (keep) input.current?.focus({ preventScroll: true });
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
      onPointerDown={() => {
        typing.current = document.activeElement === input.current;
      }}
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      {grip}
      {shown.mounted && frozen.current && (
        <Strip {...frozen.current} leaving={shown.leaving}>
          {frozen.current.kind === "running" ? stripActions : null}
        </Strip>
      )}
      <div className="zr-compose-row" data-attach={attach ? "" : undefined}>
        {attach && <Pill {...attach} className="zr-attach" />}
        <textarea
          ref={setInput}
          className={["zr-input", inputClassName].filter(Boolean).join(" ")}
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(ev) => onChange(ev.target.value)}
          onKeyDown={onKey}
          autoCapitalize="sentences"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={coarse ? "enter" : "send"}
        />
        {accessory}
        <PillPair label="Send">
          {command && <Pill {...command} className="zr-command" />}
          <Pill glyph={sendGlyph} label={sendLabel} type="submit" disabled={sendDisabled} className={["zr-send", sendClassName].filter(Boolean).join(" ")} data-swapped={swap.current.swapped ? "" : undefined} key={sendLabel} />
        </PillPair>
      </div>
    </form>
  );
}
