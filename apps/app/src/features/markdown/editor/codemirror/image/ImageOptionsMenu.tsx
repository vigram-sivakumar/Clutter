import type { RefObject } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { AppIcon, SystemIcon } from '@shared/icon';

import type { ImageDisplayMode } from './imageUiState';

import './ImageOptionsMenu.css';

export interface ImageOptionsMenuAnchor {
  readonly current: HTMLElement;
}

export interface ImageOptionsMenuProps {
  readonly anchor: ImageOptionsMenuAnchor | null;
  readonly currentMode: ImageDisplayMode;
  readonly onClose: () => void;
  readonly onSelectMode: (mode: ImageDisplayMode) => void;
  readonly onCopyLink: () => void;
  /**
   * "Set as cover image" (2026-09-02 UX baseline, item 9) — present only
   * when the host has an actual cover-writing capability to offer (mirrors
   * `ResourceTopBarActions`'s own `onSetCoverImage?` capability-gating
   * shape, not a plain always-rendered callback): `MarkdownEditor.tsx`
   * only supplies this when its own `onSetCoverImage` prop was given,
   * which in turn is only ever `PageHost.tsx`'s existing
   * `PageOperations.updateMetadata({ cover })` closure — the single
   * existing owner of a page's cover, already used by the top bar's own
   * cover picker. This menu item is a second *entry point* into that same
   * one write path, never a second implementation of it.
   */
  readonly onSetCoverImage?: () => void;
  /**
   * Downloads a copy of this image (embedded local Resource or a plain
   * external URL alike) to a user-chosen destination via the native Save
   * dialog — always present, unlike `onSetCoverImage`'s capability-gating,
   * since every image the editor renders is a download candidate
   * regardless of whether it resolves to a local `VaultResource`
   * (`MarkdownEditor.tsx`'s `handleDownloadImage` picks between
   * `downloadResource.ts`/`downloadRemoteImage.ts` accordingly, at the app
   * layer — this menu itself has no opinion on which).
   */
  readonly onDownload: () => void;
  readonly onDelete: () => void;
}

const MODE_ITEMS: ReadonlyArray<{
  mode: ImageDisplayMode;
  label: string;
  icon: SystemIcon;
}> = [
  { mode: 'large', label: 'Large', icon: 'squareExpand' },
  { mode: 'fill', label: 'Fill', icon: 'widthFill' },
  { mode: 'fit', label: 'Fit', icon: 'portrait' },
];

/**
 * The image's size/options menu — deliberately built directly on the
 * project's existing `Overlay` + `Menu` + `MenuItem` primitives (the same
 * three `OverflowMenu.tsx` composes for its own "⋯" trigger), not
 * `OverflowMenu` itself and not a new menu component. Two reasons
 * `OverflowMenu` specifically wasn't reused as-is: it hardcodes its own
 * "⋯" (`moreVertical`) trigger button, and its flat `items` list has no
 * divider support — neither exists in this codebase to extend, and this
 * menu's own trigger button lives inside `ImageWidget.ts`'s raw CM6 DOM,
 * not React, so `OverflowMenu`'s own built-in `<Button>` trigger couldn't
 * be reused directly regardless. `Overlay`/`Menu`/`MenuItem` are reused
 * completely unmodified; the one new piece is `.menu__divider` (one CSS
 * rule, `ImageOptionsMenu.css`) — a data cell this codebase's existing
 * menu usage (e.g. `noteTopBarMenu.config.ts`) never needed before, since
 * no existing menu groups items with a visible separator today.
 *
 * `anchor` bridges the CM6-widget-owned trigger button into `Overlay`'s
 * `anchorRef: RefObject<HTMLElement>` contract — a plain `{current:
 * HTMLElement}` object (the actual button element from `ImageWidget`'s
 * `toDOM()`), not a React-created ref, which `Overlay`'s own positioning
 * hooks only ever read via `.current` and never require to be React-owned.
 *
 * Every item closes the menu in the same handler that performs its
 * action (`onSelectMode`/`onCopyLink`/`onDelete` each also
 * call `onClose()`), mirroring `OverflowMenu`'s own `onSelect` +
 * `onOpenChange(false)` pattern — this is what keeps the bridged
 * `anchor` element safe even though `ImageWidget`'s DOM can be recreated
 * by a decoration rebuild the instant a mode changes: the close and the
 * state change happen in the same synchronous handler, before `Overlay`
 * would ever need to re-read a now-stale `anchor.current` for an
 * open menu.
 */
export function ImageOptionsMenu({
  anchor,
  currentMode,
  onClose,
  onSelectMode,
  onCopyLink,
  onSetCoverImage,
  onDownload,
  onDelete,
}: ImageOptionsMenuProps) {
  return (
    <Overlay
      open={anchor !== null}
      onClose={onClose}
      anchorRef={(anchor ?? { current: null }) as RefObject<HTMLElement>}
      side="bottom"
      alignment="end"
    >
      <Menu size="small">
        {MODE_ITEMS.map(({ mode, label, icon }) => (
          <MenuItem
            key={mode}
            selected={mode === currentMode}
            onClick={(event) => {
              event.stopPropagation();
              onSelectMode(mode);
              onClose();
            }}
            leading={<AppIcon icon={icon} />}
          >
            {label}
          </MenuItem>
        ))}

        <div className="menu__divider" role="separator" />

        <MenuItem
          leading={<AppIcon icon="link" />}
          onClick={(event) => {
            event.stopPropagation();
            onCopyLink();
            onClose();
          }}
        >
          Copy link
        </MenuItem>
        {onSetCoverImage && (
          <MenuItem
            leading={<AppIcon icon="image" />}
            onClick={(event) => {
              event.stopPropagation();
              onSetCoverImage();
              onClose();
            }}
          >
            Set as cover image
          </MenuItem>
        )}
        <MenuItem
          leading={<AppIcon icon="download" />}
          onClick={(event) => {
            event.stopPropagation();
            onDownload();
            onClose();
          }}
        >
          Download
        </MenuItem>

        <div className="menu__divider" role="separator" />

        <MenuItem
          leading={<AppIcon icon="trash" />}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
            onClose();
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Overlay>
  );
}
