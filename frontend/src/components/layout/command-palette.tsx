"use client";

import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { NavGroup, NavItem } from "@/components/layout/nav-config";

interface PaletteEntry {
  group: NavGroup;
  item: NavItem;
  /** Position in the flattened result list, for aria-activedescendant. */
  index: number;
}

/**
 * Command palette: the prototype's `Search modules` field, made real.
 *
 * It searches the navigation the signed-in role can actually reach, so it can
 * never offer a destination the guard would bounce. Nothing is fetched and
 * nothing is faked: every result is a route that exists.
 */
export function CommandPalette({
  open,
  groups,
  onClose,
}: {
  open: boolean;
  groups: NavGroup[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset when the palette is (re)opened, so it never shows the last search.
  // Adjusted during render rather than in an effect, which would cascade.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const entries: PaletteEntry[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        const matches =
          !needle ||
          item.label.toLowerCase().includes(needle) ||
          group.label.toLowerCase().includes(needle) ||
          item.href.toLowerCase().includes(needle);
        if (matches) entries.push({ group, item, index: entries.length });
      }
    }
    return entries;
  }, [groups, query]);

  const total = results.length;

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  if (!open) return null;

  const move = (delta: number) => {
    if (total === 0) return;
    setActiveIndex((index) => (index + delta + total) % total);
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onClose();
        return;
      case "ArrowDown":
        event.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        return;
      case "Enter": {
        const target = results[activeIndex];
        if (!target) return;
        event.preventDefault();
        go(target.item.href);
        return;
      }
      default:
        break;
    }
  };

  const activeId = results[activeIndex] ? `command-option-${activeIndex}` : undefined;
  let previousGroup: NavGroup | null = null;

  return (
    <div
      className="command-palette"
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search SmartCampus"
      >
        <div className="command-palette__field">
          <Search size={17} aria-hidden="true" />
          <input
            className="command-palette__input"
            type="text"
            role="combobox"
            autoFocus
            autoComplete="off"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={activeId}
            aria-label="Search pages"
            placeholder="Search pages…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
        </div>

        {total === 0 ? (
          <p className="command-palette__empty">No page matches “{query.trim()}”.</p>
        ) : (
          <ul className="command-palette__list" id="command-palette-list" role="listbox" aria-label="Pages">
            {results.map(({ group, item, index }) => {
              const heading = group !== previousGroup ? group.label : null;
              previousGroup = group;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  {heading && <p className="command-palette__group">{heading}</p>}
                  <button
                    type="button"
                    id={`command-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className="command-palette__item"
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => go(item.href)}
                  >
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span className="command-palette__label">{item.label}</span>
                    <span className="command-palette__trail">{item.href}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="command-palette__hint">
          <span>↑ ↓ to move</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </p>
      </div>
    </div>
  );
}
