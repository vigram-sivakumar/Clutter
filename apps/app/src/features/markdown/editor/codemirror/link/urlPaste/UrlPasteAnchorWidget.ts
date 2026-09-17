import { WidgetType } from '@codemirror/view';

export interface OpenUrlPasteMenuParams {
  readonly anchor: HTMLElement;
  readonly id: number;
}

export type OnOpenUrlPasteMenu = (params: OpenUrlPasteMenuParams) => void;

/**
 * A transient, invisible DOM anchor for the "Paste as" `Overlay`/`Menu` —
 * the Phase 1.5 investigation's recommended reuse of the existing
 * DOM-anchored-menu pattern (`FencedCodeActionsButtonWidget.ts`), minus the
 * visible button chrome: this menu opens automatically as a direct
 * consequence of the paste transaction, never a click. `ignoreEvent()`
 * returns `false` and there is no visible content, so the widget never
 * intercepts or displaces ordinary caret/click behavior at its position —
 * it exists purely to give `Overlay`'s `anchorRef` a real, positioned DOM
 * element to measure (`getBoundingClientRect()`), per the established
 * "every menu in this codebase anchors to a real DOM element, never a raw
 * coordinate" convention.
 */
export class UrlPasteAnchorWidget extends WidgetType {
  constructor(
    private readonly id: number,
    private readonly getOnOpenUrlPasteMenu: () => OnOpenUrlPasteMenu | undefined
  ) {
    super();
  }

  override eq(other: UrlPasteAnchorWidget): boolean {
    return this.id === other.id;
  }

  override toDOM(): HTMLElement {
    const anchor = document.createElement('span');
    anchor.className = 'cm-url-paste-anchor';
    // Opens on the same tick the widget is first mounted — CM6 mounts a
    // freshly-added widget synchronously as part of the measure/draw pass
    // following the transaction that created it, so this fires exactly
    // once per pasted occurrence, immediately after the paste.
    queueMicrotask(() => {
      if (anchor.isConnected) {
        this.getOnOpenUrlPasteMenu()?.({ anchor, id: this.id });
      }
    });
    return anchor;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
