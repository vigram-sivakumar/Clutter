import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

const MENU_ITEM_SELECTOR = '[role="menuitem"]';

function findNextEnabledItem(
  items: HTMLElement[],
  startIndex: number
): HTMLElement | undefined {
  for (let i = 1; i <= items.length; i++) {
    const item = items[(startIndex + i) % items.length];
    if (item?.getAttribute('aria-disabled') !== 'true') {
      return item;
    }
  }
}

function findPreviousEnabledItem(
  items: HTMLElement[],
  startIndex: number
): HTMLElement | undefined {
  for (let i = 1; i <= items.length; i++) {
    const item = items[(startIndex - i + items.length) % items.length];
    if (item?.getAttribute('aria-disabled') !== 'true') {
      return item;
    }
  }
}

function findFirstEnabledItem(items: HTMLElement[]): HTMLElement | undefined {
  return findNextEnabledItem(items, -1);
}

function findLastEnabledItem(items: HTMLElement[]): HTMLElement | undefined {
  return findPreviousEnabledItem(items, 0);
}

interface UseMenuKeyboardOptions {
  /**
   * ArrowRight has no meaning to a plain roving menu — only a caller that
   * knows about submenus (OverflowMenu) supplies this, to open one when the
   * currently active item owns one. Receiving the raw `activeId` (rather
   * than this hook trying to resolve "which item") keeps this hook itself
   * ignorant of submenus entirely.
   */
  onArrowRight?: (activeId: string | undefined) => void;
  /**
   * ArrowLeft, symmetrically, closes a submenu and hands keyboard ownership
   * back to its parent menu — again, only ever supplied by a submenu's own
   * Menu instance.
   */
  onArrowLeft?: () => void;
  /**
   * Keeps the active item resolved to this id whenever it's among the
   * currently navigable (non-`aria-disabled`) items, falling back to the
   * first navigable item otherwise, or clearing entirely when there are
   * none — recomputed automatically whenever the navigable item *set*
   * itself changes (e.g. a caller re-filtering a searchable list), never
   * on every render and never overriding an in-progress Arrow-key/hover
   * navigation within a set that hasn't changed. See this hook's own
   * internal effect for exactly how "changed" is detected.
   *
   * **Omitting this option (the default) preserves the exact prior
   * behavior for every existing caller**: `activeId` starts `undefined`
   * and is only ever set by an explicit Arrow keypress or a caller's own
   * `setActiveId` call — nothing here runs unless a caller opts in by
   * passing this.
   *
   * Pass `null` (not just omitting the option) to opt in with "no current
   * preference" — e.g. an unrecognized selection — which still resolves
   * to the first navigable item rather than leaving `activeId` untouched.
   * `undefined` and `null` are deliberately distinct: `undefined` means
   * "this caller doesn't use this feature at all," `null` means "this
   * caller uses it, but has no specific id to prefer right now."
   *
   * Deliberately generic — this hook has no notion of what "preferred"
   * means to any particular caller (a selected language, a currently-open
   * folder, ...); it only ever compares plain DOM element ids.
   */
  preferredActiveId?: string | null;
}

interface UseMenuKeyboardResult {
  activeId?: string;
  setActiveId: (id: string | undefined) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function useMenuKeyboard(
  menuRef: RefObject<HTMLDivElement | null>,
  { onArrowRight, onArrowLeft, preferredActiveId }: UseMenuKeyboardOptions = {}
): UseMenuKeyboardResult {
  const [activeId, setActiveId] = useState<string>();

  const getMenuItems = useCallback(() => {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []
    );
  }, [menuRef]);

  // Resolves `preferredActiveId` against the *navigable* (non-disabled)
  // item set — recomputed after every render, but only ever acts when
  // that set (or `preferredActiveId` itself) has genuinely changed since
  // the last time this ran, tracked via `resolutionKeyRef`. This is what
  // makes it safe to run unconditionally on every render (no dependency
  // array): a render caused by the user's own Arrow-key/hover navigation
  // doesn't change the navigable id set, so the key comparison below
  // bails out immediately and never stomps on that navigation — only a
  // render that actually adds/removes/reorders navigable items (a caller
  // re-filtering a searchable list) or changes `preferredActiveId` itself
  // triggers a real re-resolution. `undefined` (the default,
  // `preferredActiveId` omitted entirely) skips this whole mechanism, so
  // every existing caller that doesn't pass it keeps `activeId` starting
  // `undefined` and changing only via explicit Arrow/hover/`setActiveId`
  // calls, exactly as before this option existed.
  const resolutionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (preferredActiveId === undefined) {
      return;
    }

    const navigableItems = getMenuItems().filter(
      (item) => item.getAttribute('aria-disabled') !== 'true'
    );
    // A space can't appear in a real DOM id, so joining ids with it
    // and appending the preferred value can't collide across different
    // item-id/preferred-value splits.
    const resolutionKey =
      navigableItems.map((item) => item.id).join(' ') +
      '|' +
      String(preferredActiveId);
    if (resolutionKey === resolutionKeyRef.current) {
      return;
    }
    resolutionKeyRef.current = resolutionKey;

    const firstNavigableItem = navigableItems[0];
    if (!firstNavigableItem) {
      setActiveId(undefined);
      return;
    }

    const preferredIsNavigable =
      preferredActiveId !== null &&
      navigableItems.some((item) => item.id === preferredActiveId);
    setActiveId(
      preferredIsNavigable ? preferredActiveId! : firstNavigableItem.id
    );
  });

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const items = getMenuItems();

      if (items.length === 0) {
        return;
      }

      // Every handled key stops here rather than bubbling further — a
      // submenu's Menu is a React *descendant* of its parent Menu (nested
      // JSX), even though Overlay portals each one to a separate spot in
      // the real DOM. React replays synthetic events along that React
      // (fiber) ancestry regardless of DOM placement, so without this a
      // single keypress handled by an inner Menu would also reach the
      // outer Menu's own handleKeyDown and move its activeId at the same
      // time — the "both menus react to one keystroke" bug. Each Menu
      // instance owns the keys it consumes; only Escape (handled by
      // useEscape, a raw document listener, not React's synthetic system)
      // has its own separate nesting fix.
      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          event.stopPropagation();

          if (!activeId) {
            const firstEnabledItem = findFirstEnabledItem(items);
            if (firstEnabledItem) {
              setActiveId(firstEnabledItem.id);
            }
            return;
          }
          const currentIndex = items.findIndex((item) => item.id === activeId);
          const nextItem = findNextEnabledItem(items, currentIndex);
          if (nextItem) {
            setActiveId(nextItem.id);
          }
          return;
        }

        case 'ArrowUp': {
          event.preventDefault();
          event.stopPropagation();

          if (!activeId) {
            const lastEnabledItem = findLastEnabledItem(items);
            if (lastEnabledItem) {
              setActiveId(lastEnabledItem.id);
            }
            return;
          }
          const currentIndex = items.findIndex((item) => item.id === activeId);
          const previousItem = findPreviousEnabledItem(items, currentIndex);
          if (previousItem) {
            setActiveId(previousItem.id);
          }
          return;
        }

        case 'Home': {
          event.preventDefault();
          event.stopPropagation();

          const firstEnabledItem = findFirstEnabledItem(items);
          if (firstEnabledItem) {
            setActiveId(firstEnabledItem.id);
          }
          return;
        }

        case 'End': {
          event.preventDefault();
          event.stopPropagation();

          const lastEnabledItem = findLastEnabledItem(items);
          if (lastEnabledItem) {
            setActiveId(lastEnabledItem.id);
          }
          return;
        }

        case 'Enter':
        case ' ': {
          event.preventDefault();
          event.stopPropagation();

          if (!activeId) {
            return;
          }

          const activeItem = items.find((item) => item.id === activeId);

          if (activeItem?.getAttribute('aria-disabled') !== 'true') {
            activeItem?.click();
          }

          return;
        }

        case 'ArrowRight': {
          if (onArrowRight) {
            event.preventDefault();
            event.stopPropagation();
            onArrowRight(activeId);
          }
          return;
        }

        case 'ArrowLeft': {
          if (onArrowLeft) {
            event.preventDefault();
            event.stopPropagation();
            onArrowLeft();
          }
          return;
        }

        default:
          return;
      }
    },
    [activeId, getMenuItems, onArrowRight, onArrowLeft]
  );

  return {
    activeId,
    setActiveId,
    handleKeyDown,
  };
}
