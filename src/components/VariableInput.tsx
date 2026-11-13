import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { createPortal } from "react-dom";

interface Props extends Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  variables?: readonly string[];
}

export function VariableInput({ value, onValueChange, variables, list, ...props }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [position, setPosition] = useState<DOMRect | null>(null);
  const [active, setActive] = useState(-1);
  const partial = caret === null ? null : /\{\{([^{}]*)(?:\}{1,2})?$/.exec(value.slice(0, caret));
  const query = partial?.[1].trim().toLowerCase();
  const matches = query === undefined ? [] : (variables ?? []).filter((key) => key.toLowerCase().includes(query));
  const open = partial !== null && variables !== undefined && position !== null;
  const width = position ? Math.min(Math.max(180, position.width), window.innerWidth - 8) : 0;

  useEffect(() => {
    if (!open) return;
    const reposition = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      if (input.current) setPosition(input.current.getBoundingClientRect());
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const updateCaret = (field: HTMLInputElement) => {
    setCaret(field.selectionEnd ?? field.value.length);
    setPosition(field.getBoundingClientRect());
    setActive(-1);
  };

  const choose = (key: string) => {
    if (!partial || caret === null) return;
    const remainder = value.slice(caret);
    const suffix = partial[0].endsWith("}}") ? remainder : remainder.replace(/^[^{}]*\}\}|^\}/, "");
    const prefix = value.slice(0, partial.index) + `{{${key}}}`;
    onValueChange(prefix + suffix);
    setCaret(null);
    requestAnimationFrame(() => input.current?.setSelectionRange(prefix.length, prefix.length));
  };

  return (
    <>
      <input
        {...props}
        ref={input}
        value={value}
        list={partial ? undefined : list}
        role={variables?.length ? "combobox" : undefined}
        aria-autocomplete={variables?.length ? "list" : undefined}
        aria-expanded={variables?.length ? open : undefined}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
        onChange={(event) => {
          updateCaret(event.currentTarget);
          onValueChange(event.currentTarget.value);
        }}
        onFocus={(event) => updateCaret(event.currentTarget)}
        onClick={(event) => updateCaret(event.currentTarget)}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateCaret(event.currentTarget);
        }}
        onBlur={() => setCaret(null)}
        onKeyDown={(event) => {
          if (!open || event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setCaret(null);
          } else if (event.key === "Enter" && (matches[active] || matches.length === 1)) {
            event.preventDefault();
            event.stopPropagation();
            choose(matches[active] ?? matches[0]);
          } else if (matches.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            const next = event.key === "ArrowDown"
              ? (active + 1) % matches.length
              : active <= 0 ? matches.length - 1 : active - 1;
            setActive(next);
            menu.current?.children[next]?.scrollIntoView({ block: "nearest" });
          }
        }}
      />
      {open && createPortal(
        <div
          id={id}
          ref={menu}
          role="listbox"
          aria-label="Environment variables"
          className="variable-input-menu"
          style={{
            left: Math.max(4, Math.min(position.left, window.innerWidth - width - 4)),
            width,
            ...(window.innerHeight - position.bottom >= 180
              ? { top: position.bottom + 4 }
              : { bottom: window.innerHeight - position.top + 4 }),
          }}
        >
          {matches.length === 0 && (
            <div className="variable-input-empty" role="status">
              {variables?.length ? "No matching environment variables" : "No enabled variables in the active environment"}
            </div>
          )}
          {matches.map((key, index) => (
            <div
              key={key}
              id={`${id}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(key)}
            >
              {`{{${key}}}`}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
