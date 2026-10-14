import type { MutableRefObject, RefObject } from 'react';
import { useRef } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

export interface NoteEmbedMoreActionsAnchor {
  readonly current: HTMLElement;
}

export interface NoteEmbedMoreActionsProps {
  /** Bridges `NoteEmbedWidget.ts`'s raw CM6 DOM trigger button into `Overlay`'s `anchorRef` contract — same shape/reasoning as `ImageOptionsMenu`'s own `anchor` prop/`PdfEmbedMoreActions`'s own `anchor` prop. `null` when no note embed's More actions is currently open. */
  readonly anchor: NoteEmbedMoreActionsAnchor | null;
  readonly onClose: () => void;
  /** Converts this embed's `![[Note]]` into a plain `[[Note]]` WikiLink in the current note only — never touches the source note. */
  readonly onTurnIntoWikiLink?: () => void;
  /** Removes this embed's own `![[...]]` Markdown from the current note only — never the underlying note. See `embedRemovalRange.ts`'s own doc comment for the Remove-vs-source-note product rule. */
  readonly onRemove?: () => void;
}

const MENU_ITEMS: OverflowMenuItemConfig[] = [
  { id: 'turn-into-wikilink', label: 'Turn into WikiLink', icon: 'link' },
  // Visually separated from the action above by a real divider
  // (`OverflowMenuItemConfig.separatorBefore`, `Menu.css`'s
  // `.menu__divider`) — the same Remove-last-below-a-divider convention
  // `PdfEmbedMoreActions.tsx` establishes, applied here even though this
  // menu (unlike PDF's) has no source-resource actions to separate from:
  // consistency across every embed's "More actions" menu, not just the
  // ones that happen to need it for a resource-vs-embed distinction.
  { id: 'remove-embed', label: 'Remove', icon: 'trash', separatorBefore: true, variant: 'danger' },
];

/**
 * A note embed's own floating "More actions" control — deliberately its
 * own, much smaller menu than `PdfEmbedMoreActions.tsx`'s: a note embed
 * has no backing `VaultResource`, so there is no Rename/Move/Reveal in
 * Finder/Copy path/Archive block here at all, only the two actions that
 * genuinely apply to a note embed. Built the same way
 * `ImageOptionsMenu.tsx`/`PdfEmbedMoreActions.tsx` are: this control's own
 * trigger button lives inside `NoteEmbedWidget.ts`'s raw CM6 DOM, not a
 * React tree, so this component owns only the menu body (`Overlay` +
 * `OverflowMenuBody`, reused unmodified — same menu/keyboard/focus
 * behavior as every other menu in the app), anchored to that
 * externally-owned button via the same `{current: HTMLElement}` bridging
 * `ImageOptionsMenu`'s own `anchor` prop establishes. `size="small"`
 * matches Image's and (now) PDF's own menu width.
 */
export function NoteEmbedMoreActions({
  anchor,
  onClose,
  onTurnIntoWikiLink,
  onRemove,
}: NoteEmbedMoreActionsProps) {
  const suppressReturnFocusRef = useRef(false);

  function handleSelect(id: string) {
    if (id === 'turn-into-wikilink') {
      onTurnIntoWikiLink?.();
    } else if (id === 'remove-embed') {
      onRemove?.();
    }
  }

  return (
    <Overlay
      open={anchor !== null}
      onClose={onClose}
      anchorRef={(anchor ?? { current: null }) as RefObject<HTMLElement>}
      side="bottom"
      alignment="end"
    >
      <OverflowMenuBody
        items={MENU_ITEMS}
        size="small"
        onSelect={handleSelect}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        suppressReturnFocusRef={suppressReturnFocusRef as MutableRefObject<boolean>}
      />
    </Overlay>
  );
}
