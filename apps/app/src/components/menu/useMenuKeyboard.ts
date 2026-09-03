import { useCallback, useState } from 'react';
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
}

interface UseMenuKeyboardResult {
  activeId?: string;
  setActiveId: (id: string | undefined) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function useMenuKeyboard(
  menuRef: RefObject<HTMLDivElement | null>,
  { onArrowRight, onArrowLeft }: UseMenuKeyboardOptions = {}
): UseMenuKeyboardResult {
  const [activeId, setActiveId] = useState<string>();

  const getMenuItems = useCallback(() => {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []
    );
  }, [menuRef]);

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
