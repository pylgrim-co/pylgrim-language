"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Custom select (design.md §5: the system version's popup is not stylable).
 * Select-only combobox pattern: focus stays on the trigger, the highlighted
 * option is conveyed via aria-activedescendant, arrows navigate, Enter/Space
 * commit, Escape closes. The menu animates via the .dropdown CSS in globals.
 */

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** accessible name for the trigger */
  ariaLabel: string;
  minWidth?: string;
}

export default function Select({ value, options, onChange, ariaLabel, minWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  function openMenu() {
    setActive(selectedIndex);
    setOpen(true);
  }

  function commit(i: number) {
    onChange(options[i].value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div className={open ? "dropdown open" : "dropdown"} ref={rootRef} style={minWidth ? { minWidth } : undefined}>
      <button
        type="button"
        className="dropdown-btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span>{selected?.label}</span>
      </button>
      <ul className="dropdown-menu" role="listbox" id={listId} aria-label={ariaLabel}>
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={o.value === value}
            className={i === active ? "is-active" : ""}
            onPointerDown={(e) => e.preventDefault()}
            onPointerMove={() => setActive(i)}
            onClick={() => commit(i)}
          >
            {o.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
