import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';

const LIST_SELECTOR = '.cm-tooltip-autocomplete > ul';
const ATTRIBUTE = 'data-can-scroll-down';

/**
 * Marks the popup's list `data-can-scroll-down` while it has rows below the visible ones, so the
 * theme can fade its bottom edge (`completionPopupTheme.ts`) — `PickerList`'s same attribute and
 * rule. CSS cannot tell that a list has more to scroll to, and CM6 exposes no hook for it, so the
 * list is measured after each editor update (a selection move can scroll it) and on its own scroll.
 *
 * The list is found from the editor: CM6 mounts the tooltip inside the editor's DOM, or inside
 * the `parent` a host passed to `tooltips()`, which is a sibling container of the editor.
 */
export function completionScrollFade(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly watched = new WeakSet<HTMLElement>();

      constructor(private readonly view: EditorView) {}

      update(): void {
        this.view.requestMeasure({
          read: () => {
            const list = this.findList();
            return list ? { list, canScrollDown: canScrollDown(list) } : null;
          },
          write: (result) => {
            if (!result) {
              return;
            }
            this.watch(result.list);
            setFlag(result.list, result.canScrollDown);
          },
        });
      }

      private findList(): HTMLElement | null {
        const { dom } = this.view;
        return dom.querySelector<HTMLElement>(LIST_SELECTOR) ?? dom.parentElement?.querySelector<HTMLElement>(LIST_SELECTOR) ?? null;
      }

      private watch(list: HTMLElement): void {
        if (this.watched.has(list)) {
          return;
        }
        this.watched.add(list);
        list.addEventListener('scroll', () => setFlag(list, canScrollDown(list)), { passive: true });
      }
    }
  );
}

function canScrollDown(list: HTMLElement): boolean {
  // The list's own bottom padding scrolls but is not content: don't count it, or the fade would
  // dim the last real row whenever the list ends just short of that padding.
  const padding = parseFloat(getComputedStyle(list).paddingBottom) || 0;
  return list.scrollTop + list.clientHeight < list.scrollHeight - padding - 1;
}

function setFlag(list: HTMLElement, on: boolean): void {
  if (on) {
    list.setAttribute(ATTRIBUTE, '');
  } else {
    list.removeAttribute(ATTRIBUTE);
  }
}
