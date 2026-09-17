import type { RefObject } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';

export interface UrlPasteMenuAnchor {
  readonly current: HTMLElement;
}

export interface UrlPasteMenuProps {
  readonly anchor: UrlPasteMenuAnchor | null;
  /** "Markdown link" chosen — synchronously converts to `[](url)` with the selection between the brackets. */
  readonly onChooseMarkdownLink: () => void;
  /**
   * "URL" explicitly chosen — appends exactly one space after the URL and
   * places the selection right after it, so the user can keep typing
   * (e.g. "https://example.com/article and here's why..."). Distinct from
   * plain dismissal (below): this is a deliberate choice, not a no-op.
   */
  readonly onChooseUrl: () => void;
  /**
   * The menu was dismissed without an explicit choice (Escape,
   * click-outside) — the raw URL is left completely unchanged, unlike
   * explicitly choosing "URL" above. `Overlay`'s own `onClose` is the only
   * caller.
   */
  readonly onDismiss: () => void;
  /**
   * Where focus returns on close — the editor's own `contentDOM`, not
   * `Overlay`'s own default (`anchorRef`), since this menu's anchor is a
   * transient widget removed the moment a choice is made (Phase 2 spec:
   * "Focus must return to the editor/caret rather than leaving focus on a
   * destroyed synthetic anchor").
   */
  readonly returnFocusRef?: RefObject<HTMLElement>;
}

/**
 * The transient "Paste as" menu (Phase 1.5 §1/§2) — opened automatically by
 * `UrlPasteAnchorWidget` as a direct consequence of a paste transaction,
 * never by a click. Reuses the shared `Menu`/`Overlay` primitives exactly
 * as `FencedCodeActionsMenu.tsx` does; the only thing specific to this menu
 * is its two items and that dismissal is itself a meaningful choice ("URL"),
 * not a no-op.
 */
export function UrlPasteMenu({ anchor, onChooseMarkdownLink, onChooseUrl, onDismiss, returnFocusRef }: UrlPasteMenuProps) {
  return (
    <Overlay
      open={anchor !== null}
      onClose={onDismiss}
      anchorRef={(anchor ?? { current: null }) as RefObject<HTMLElement>}
      returnFocusRef={returnFocusRef}
      side="bottom"
      alignment="start"
    >
      <Menu size="small">
        <MenuGroupTitle>Paste as</MenuGroupTitle>
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            onChooseMarkdownLink();
          }}
        >
          Markdown link
        </MenuItem>
        <MenuItem
          onClick={(event) => {
            event.stopPropagation();
            onChooseUrl();
          }}
        >
          URL
        </MenuItem>
      </Menu>
    </Overlay>
  );
}
