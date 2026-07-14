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

interface UseMenuKeyboardResult {
  activeId?: string;
  setActiveId: (id: string | undefined) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function useMenuKeyboard(
  menuRef: RefObject<HTMLDivElement | null>
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

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();

          if (!activeId) {
            const firstEnabledItem = findFirstEnabledItem(items);
            if (firstEnabledItem) {
              console.log('ArrowDown -> firstEnabledItem', firstEnabledItem.id);
              setActiveId(firstEnabledItem.id);
            }
            return;
          }
          const currentIndex = items.findIndex((item) => item.id === activeId);
          const nextItem = findNextEnabledItem(items, currentIndex);
          if (nextItem) {
            console.log('ArrowDown -> nextItem', {
              currentIndex,
              current: activeId,
              next: nextItem.id,
            });
            setActiveId(nextItem.id);
          }
          return;
        }

        case 'ArrowUp': {
          event.preventDefault();

          if (!activeId) {
            const lastEnabledItem = findLastEnabledItem(items);
            if (lastEnabledItem) {
              console.log('ArrowUp -> lastEnabledItem', lastEnabledItem.id);
              setActiveId(lastEnabledItem.id);
            }
            return;
          }
          const currentIndex = items.findIndex((item) => item.id === activeId);
          const previousItem = findPreviousEnabledItem(items, currentIndex);
          if (previousItem) {
            console.log('ArrowUp -> previousItem', {
              currentIndex,
              current: activeId,
              previous: previousItem.id,
            });
            setActiveId(previousItem.id);
          }
          return;
        }

        case 'Home': {
          event.preventDefault();

          const firstEnabledItem = findFirstEnabledItem(items);
          if (firstEnabledItem) {
            setActiveId(firstEnabledItem.id);
          }
          return;
        }

        case 'End': {
          event.preventDefault();

          const lastEnabledItem = findLastEnabledItem(items);
          if (lastEnabledItem) {
            setActiveId(lastEnabledItem.id);
          }
          return;
        }

        case 'Enter':
        case ' ': {
          event.preventDefault();

          if (!activeId) {
            return;
          }

          const activeItem = items.find((item) => item.id === activeId);

          if (activeItem?.getAttribute('aria-disabled') !== 'true') {
            console.log('Activate', activeItem?.id);
            activeItem?.click();
          }

          return;
        }

        default:
          return;
      }
    },
    [activeId, getMenuItems]
  );

  return {
    activeId,
    setActiveId,
    handleKeyDown,
  };
}
