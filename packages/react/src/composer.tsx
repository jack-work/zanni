import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Pill, PillPair, type PillSpec } from "./pill";
import { onKeyboard } from "./viewport";

export const KEYBOARD_CLOSE_SETTLE_MS = 300;
export const ONE_LINE_MAX = 44;

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
  prompt?: string;
  mode?: string;
  hints?: ReactNode;
  tray?: ReactNode;
  onEscape?: () => void;
  onTab?: () => void;
  enterRuns?: boolean;
  sendDisabled?: boolean;
  running?: boolean;
  queue?: ReactNode;
  accessory?: ReactNode;
  stacked?: boolean;
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

function markScrolls(el: HTMLTextAreaElement): void {
  el.toggleAttribute("data-scrolls", el.scrollHeight > el.clientHeight + 1);
}

export function Composer(props: ComposerProps) {
  const { value, onChange, onSubmit, label = "Message", placeholder, sendLabel, sendGlyph, attach, command, prompt, mode, hints, tray, onEscape, onTab, enterRuns, sendDisabled, running, queue, accessory, stacked, focusTick, inputRef, heightVar = "--zr-composer-h", className, inputClassName, sendClassName } = props;
  const form = useRef<HTMLFormElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const typing = useRef(false);
  const coarse = useCoarsePointer();
  const grows = useMemo(() => !(window.CSS?.supports && window.CSS.supports("field-sizing", "content")), []);
  useSizeVar(form, heightVar);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    if (grows) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + "px";
    }
    markScrolls(el);
  }, [value, grows]);

  const setInput = (el: HTMLTextAreaElement | null) => {
    input.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) (inputRef as { current: HTMLTextAreaElement | null }).current = el;
  };

  const [stack, setStack] = useState(false);
  useEffect(() => {
    if (value === "") setStack(false);
  }, [value]);
  useEffect(() => {
    const el = input.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      if (el.offsetHeight > ONE_LINE_MAX) setStack(true);
      markScrolls(el);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

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
    if (ev.nativeEvent.isComposing || ev.keyCode === 229) return;
    if (ev.key === "Escape" && onEscape) {
      ev.preventDefault();
      onEscape();
      return;
    }
    if (ev.key === "Tab" && onTab && !ev.shiftKey) {
      ev.preventDefault();
      onTab();
      return;
    }
    if (ev.key !== "Enter" || ev.shiftKey || (coarse && !enterRuns)) return;
    ev.preventDefault();
    submit();
  };

  const submit = () => {
    const keep = typing.current || document.activeElement === input.current;
    typing.current = false;
    if (keep) input.current?.focus({ preventScroll: true });
    void onSubmit();
  };

  const swap = useRef({ label: sendLabel, swapped: false });
  if (swap.current.label !== sendLabel) swap.current = { label: sendLabel, swapped: true };

  return (
    <form
      ref={form}
      className={["zr-composer", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-running={running ? "" : undefined}
      data-mode={mode}
      onPointerDown={() => {
        typing.current = document.activeElement === input.current;
      }}
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      {queue}
      {tray}
      {hints}
      <div className="zr-compose-row" data-attach={attach ? "" : undefined} data-stack={!prompt && (stack || stacked) ? "" : undefined} data-prompt={prompt ? "" : undefined}>
        {attach && <Pill {...attach} className="zr-attach" />}
        {prompt && (
          <span className="zr-prompt" aria-hidden="true">
            {prompt}
          </span>
        )}
        <textarea
          ref={setInput}
          className={["zr-input", inputClassName].filter(Boolean).join(" ")}
          data-testid="composer-input"
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(ev) => onChange(ev.target.value)}
          onKeyDown={onKey}
          autoCapitalize="sentences"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={coarse && !enterRuns ? "enter" : "send"}
        />
        {accessory}
        <PillPair label="Send">
          {command && <Pill {...command} className="zr-command" />}
          <Pill glyph={sendGlyph} label={sendLabel} type="submit" disabled={sendDisabled} className={["zr-send", sendClassName].filter(Boolean).join(" ")} data-testid="send" data-swapped={swap.current.swapped ? "" : undefined} key={sendLabel} />
        </PillPair>
      </div>
    </form>
  );
}
