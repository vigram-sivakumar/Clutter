import type { MutableRefObject, RefObject } from 'react';
import { useEffect, useRef } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { PickerListItem } from '@components/picker-list/PickerList.types';
import { MEDIA_ALIGNMENT_ITEMS } from '../mediaPresentation/mediaAlignmentItems';
import type { MediaAlignment } from '../mediaPresentation/mediaPresentationModel';
import { buildResourceSidebarMenu } from '@features/notes/sidebar/resourceSidebarMenu.config';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

export interface PdfEmbedMoreActionsAnchor {
  readonly current: HTMLElement;
}

export interface PdfEmbedMoreActionsProps {
  /** Bridges `PdfEmbedWidget.ts`'s raw CM6 DOM trigger button into `Overlay`'s `anchorRef` contract — same shape/reasoning as `ImageOptionsMenu`'s own `anchor` prop. `null` when no PDF embed's More actions is currently open. */
  readonly anchor: PdfEmbedMoreActionsAnchor | null;
  readonly resourceId: string | null;
  readonly onClose: () => void;
  /**
   * Embed-level: removes this embed's own `![[...]]` Markdown from the
   * current note only — never the underlying resource. Deliberately a
   * distinct prop/menu item from every other action here, all of which
   * are real source-resource operations (Archive included) — see
   * `embedRemovalRange.ts`'s own doc comment for the Remove-vs-Archive
   * product rule this separation enforces.
   */
  readonly onRemoveEmbed?: () => void;
  /** The embed's current alignment — highlights its Position option. Omitted (with `onSelectAlignment`) leaves the Position section out. */
  readonly currentAlignment?: MediaAlignment;
  /** Persists a new alignment into this embed's own Markdown (`![[doc.pdf|…,center]]`) — never touches the PDF file. */
  readonly onSelectAlignment?: (alignment: MediaAlignment) => void;
  /**
   * Resource-level but non-mutating (a plain file copy, same as the
   * Sidebar's own Download) — unlike `onRemoveEmbed`, this does touch the
   * resource, just never destructively. Absent omits the Download item
   * entirely, matching `resourceSidebarMenu.config.ts`'s existing
   * PDF-has-no-Download-yet default until a caller opts in.
   */
  readonly onDownloadResource?: () => void;
  readonly onArchiveResource?: (resourceId: string) => void;
  readonly onRevealResourceInFinder?: (resourceId: string) => void;
  readonly onCopyResourcePath?: (
    resourceId: string,
    format: LocationPathFormat
  ) => void;
  readonly resourceMoveDestinations?: PickerListItem[];
  readonly onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  readonly onCreateFolder?: (name: string) => Promise<string>;
}

/**
 * The inline Markdown PDF embed's own floating "More actions" control.
 * Two kinds of item share this one menu, in this order — Download, Move
 * to…, Reveal in Finder, Copy path ›, Archive, ── divider ──, Remove —
 * with a real visual divider (`OverflowMenuItemConfig.separatorBefore`,
 * `Menu.css`'s `.menu__divider`) between them, not merely an ordering
 * convention:
 *
 * 1. **Source-resource** (`download` when supplied, plus
 *    `buildResourceSidebarMenu('pdf')` minus `rename`: Move to…, Reveal in
 *    Finder, Copy path ›, Archive): the exact same menu
 *    `PdfViewerMoreActions`/`ImageOverlayMoreActions`/the Sidebar's own
 *    row menu already show, dispatched against this embed's own
 *    `resourceId` (`embedPdfResolution.ts`'s
 *    `EmbedPdfResolution['pdf'].resourceId` — already resolved, no second
 *    lookup here). These affect the actual file, not just this note.
 * 2. **Embed-level** (`remove-embed`, last, below the divider): only ever
 *    edits this note's own Markdown, never the underlying resource — see
 *    `embedRemovalRange.ts`'s own doc comment for the Remove-vs-Archive
 *    product rule this separation enforces.
 *
 * Built the same way `ImageOptionsMenu.tsx` is, not the way
 * `ImageOverlayMoreActions.tsx` is: this control's own trigger button lives
 * inside `PdfEmbedWidget.ts`'s raw CM6 DOM, not a React tree, so this
 * component owns only the menu body (`Overlay` + `OverflowMenuBody`,
 * `OverflowMenu.tsx`'s own extracted body — reused unmodified, same
 * menu/submenu/keyboard/focus behavior as every other Resource menu in the
 * app), anchored to that externally-owned button via the same
 * `{current: HTMLElement}` bridging `ImageOptionsMenu`'s own `anchor` prop
 * establishes.
 *
 * `useMoveDestinationTrigger`'s own `triggerRef` is normally attached to a
 * React-rendered trigger button via JSX `ref=`; here there is no such
 * button, so the effect below assigns `.current` directly the one time the
 * bridged `anchor` becomes available — a plain mutable-ref-object write,
 * the same technique the bridging above already relies on, not a new
 * mechanism.
 */
export function PdfEmbedMoreActions({
  anchor,
  resourceId,
  onClose,
  onRemoveEmbed,
  currentAlignment,
  onSelectAlignment,
  onDownloadResource,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
}: PdfEmbedMoreActionsProps) {
  // Position first (how this embed sits on the page), then — after a divider — the resource's own
  // actions, then Remove. Titled and highlighted like the image embed's menu.
  const positionItems: OverflowMenuItemConfig[] = onSelectAlignment
    ? MEDIA_ALIGNMENT_ITEMS.map(({ alignment, label, icon }, index) => ({
        id: `align-${alignment}`,
        label,
        icon,
        selected: alignment === currentAlignment,
        ...(index === 0 ? { groupTitle: 'Position' } : {}),
      }))
    : [];
  const resourceItems: OverflowMenuItemConfig[] = [
    ...(onDownloadResource ? [{ id: 'download', label: 'Download', icon: 'download' as const }] : []),
    ...buildResourceSidebarMenu('pdf').filter((item) => item.id !== 'rename'),
  ];
  const menuItems: OverflowMenuItemConfig[] = [
    ...positionItems,
    ...resourceItems.map((item, index) =>
      index === 0 && positionItems.length > 0 ? { ...item, separatorBefore: true } : item
    ),
    // Embed-level, never a source-resource operation — visually separated
    // from every item above (all real resource actions, Archive included)
    // by `separatorBefore`, not merely by ordering. See
    // `embedRemovalRange.ts`'s own doc comment for the Remove-vs-Archive
    // product rule this separation enforces.
    { id: 'remove-embed', label: 'Remove', icon: 'trash', separatorBefore: true },
  ];
  const moveTrigger = useMoveDestinationTrigger(resourceMoveDestinations);
  const suppressReturnFocusRef = useRef(false);

  useEffect(() => {
    (moveTrigger.triggerRef as MutableRefObject<HTMLButtonElement | null>).current =
      (anchor?.current as HTMLButtonElement | undefined) ?? null;
  }, [anchor, moveTrigger.triggerRef]);

  function handleSelect(id: string) {
    // Embed-level — never needs `resourceId`, since it only ever edits
    // this note's own Markdown text.
    if (id === 'remove-embed') {
      onRemoveEmbed?.();
      return;
    }

    // Embed-level too — only rewrites this embed's own Markdown.
    const alignment = MEDIA_ALIGNMENT_ITEMS.find((item) => `align-${item.alignment}` === id)?.alignment;
    if (alignment) {
      onSelectAlignment?.(alignment);
      return;
    }

    if (!resourceId) {
      return;
    }
    moveTrigger.handleSelect(id, (id) => {
      if (id === 'download') {
        onDownloadResource?.();
      } else if (id === 'archive') {
        onArchiveResource?.(resourceId);
      } else if (id === 'reveal-in-finder') {
        onRevealResourceInFinder?.(resourceId);
      } else if (id === 'copy-path-at-vault') {
        onCopyResourcePath?.(resourceId, 'at-vault');
      } else if (id === 'copy-path-full-path') {
        onCopyResourcePath?.(resourceId, 'full-path');
      } else if (id === 'copy-path-as-markdown') {
        onCopyResourcePath?.(resourceId, 'as-markdown');
      }
    });
  }

  return (
    <>
      <Overlay
        open={anchor !== null}
        onClose={onClose}
        anchorRef={(anchor ?? { current: null }) as RefObject<HTMLElement>}
        side="bottom"
        alignment="end"
      >
        <OverflowMenuBody
          items={menuItems}
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
      {resourceMoveDestinations !== undefined && (
        <MoveDestinationPicker
          anchorRef={moveTrigger.triggerRef}
          open={moveTrigger.open}
          onClose={moveTrigger.close}
          items={resourceMoveDestinations}
          onSelect={(destinationFolderId) => {
            moveTrigger.close();
            if (resourceId) {
              onMoveResource?.(resourceId, destinationFolderId);
            }
          }}
          onCreateFolder={onCreateFolder}
          side="bottom"
          alignment="end"
        />
      )}
    </>
  );
}
