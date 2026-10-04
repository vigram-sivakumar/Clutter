import type { RefObject } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { MenuItem } from '@components/menu/MenuItem';
import { AppIcon, SystemIcon } from '@shared/icon';

import type { ImageDisplayMode } from './imageUiState';
import type { MediaAlignment } from '../mediaPresentation/mediaPresentationModel';
import { MEDIA_ALIGNMENT_ITEMS } from '../mediaPresentation/mediaAlignmentItems';


export interface ImageOptionsMenuAnchor {
  readonly current: HTMLElement;
}

export interface ImageOptionsMenuProps {
  readonly anchor: ImageOptionsMenuAnchor | null;
  readonly currentMode: ImageDisplayMode;
  readonly currentAlignment: MediaAlignment;
  readonly onClose: () => void;
  readonly onSelectMode: (mode: ImageDisplayMode) => void;
  readonly onSelectAlignment: (alignment: MediaAlignment) => void;
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
  /** Removes this image's Markdown from the current note only — never the underlying resource. See `embedRemovalRange.ts`'s own doc comment for the Remove-vs-Archive product rule. */
  readonly onRemove: () => void;
}

const MODE_ITEMS: ReadonlyArray<{
  mode: ImageDisplayMode;
  label: string;
  icon: SystemIcon;
}> = [
  { mode: 'fit', label: 'Fit', icon: 'portrait' },
  { mode: 'fill', label: 'Fill', icon: 'widthFill' },
];

/**
 * The image's size/options menu — deliberately built directly on the
 * project's existing `Overlay` + `Menu` + `MenuItem` primitives (the same
 * three `OverflowMenu.tsx` composes for its own "⋯" trigger), not
 * `OverflowMenu` itself and not a new menu component. `OverflowMenu`
 * specifically wasn't reused as-is because it hardcodes its own "⋯"
 * (`moreVertical`) trigger button — this menu's own trigger button lives
 * inside `ImageWidget.ts`'s raw CM6 DOM, not React, so `OverflowMenu`'s
 * own built-in `<Button>` trigger couldn't be reused directly regardless.
 * `Overlay`/`Menu`/`MenuItem` are reused completely unmodified; the
 * divider below (`.menu__divider`) is the shared one
 * `OverflowMenuItemConfig.separatorBefore` also renders (`Menu.css`) —
 * not a second definition of the same rule.
 *
 * `anchor` bridges the CM6-widget-owned trigger button into `Overlay`'s
 * `anchorRef: RefObject<HTMLElement>` contract — a plain `{current:
 * HTMLElement}` object (the actual button element from `ImageWidget`'s
 * `toDOM()`), not a React-created ref, which `Overlay`'s own positioning
 * hooks only ever read via `.current` and never require to be React-owned.
 *
 * Every item closes the menu in the same handler that performs its
 * action (`onSelectMode`/`onCopyLink`/`onRemove` each also
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
  currentAlignment,
  onClose,
  onSelectMode,
  onSelectAlignment,
  onCopyLink,
  onSetCoverImage,
  onDownload,
  onRemove,
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

        <MenuGroupTitle>Position</MenuGroupTitle>
        {MEDIA_ALIGNMENT_ITEMS.map(({ alignment, label, icon }) => (
          <MenuItem
            key={alignment}
            selected={alignment === currentAlignment}
            onClick={(event) => {
              event.stopPropagation();
              onSelectAlignment(alignment);
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
            onRemove();
            onClose();
          }}
        >
          Remove
        </MenuItem>
      </Menu>
    </Overlay>
  );
}
