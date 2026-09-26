import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { ImagePicker } from './image-picker/ImagePicker';
import './Page.Cover.css';
import { AppIcon } from '@shared/icon';
import type { CoverLayout } from '@core/vault/models/PageMetadata';

type PageCoverProps = {
  src?: string;
  /**
   * The real removal — clears `cover` in persisted state (PageHost.tsx's
   * existing onRemoveCoverImage, previously only reachable from the
   * topbar's own overflow menu). Deliberately not called the instant
   * "Remove" is clicked: see the collapse-then-remove sequencing below.
   */
  onRemove?: () => void;
  /**
   * Durable state, not local — reflects the persisted `coverHidden`
   * metadata (PageMetadata.coverHidden/FolderMetadata.coverHidden), read
   * the same way `src` reflects persisted `cover`. Whether a cover is
   * hidden is a fact about the resource, not a transient animation state
   * PageCover invents locally.
   *
   * The collapse/expand transition (Page.Cover.css's `[data-hidden]`
   * rule) is a pure function of this prop, and PageCover has no logic of
   * its own distinguishing "the user just toggled this on the open
   * resource" from "a different resource's already-hidden cover just
   * mounted" — that distinction is resolved one layer up, by keying this
   * component on the active resource's id (see PageHost's own
   * `coverKey`/`titleKey` usage). A fresh mount always paints its final
   * `hidden` state directly, since CSS transitions never animate an
   * element's first paint; only a `hidden` prop change on an
   * already-mounted instance (i.e. a real Hide/Show click on the note
   * that's already open) animates. This is what keeps navigation between
   * two notes with different `coverHidden` values instant, with no
   * flash-then-collapse.
   */
  hidden?: boolean;
  /**
   * Persists `coverHidden: true` (PageHost's onHideCoverImage /
   * onHideFolderCoverImage). Never touches `cover` itself — the collapse
   * plays automatically once the resulting `hidden` prop change re-renders
   * this same mounted instance (see `hidden`'s own doc comment above).
   */
  onHide?: () => void;
  /**
   * Replaces the existing cover — the exact same
   * PageHost.onSetCoverImage/onSetFolderCoverImage write path (and
   * ImagePicker component) the page header's own "Cover image" picker
   * (PageHeaderMoreActionsMenu) already uses to *set* a first cover, reused
   * here unmodified to *change* one instead. Presence gates the "Change
   * cover image" menu item the same way the rest of this codebase gates a
   * capability on handler presence (see PageHeaderMoreActionsMenu's own
   * convention).
   */
  onSetCoverImage?: (url: string) => void;
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  /**
   * Current persisted `coverLayout` ('side' default, or 'above') — drives
   * which of the two "Position" menu rows below shows as selected. Read the
   * same way `hidden` reads `coverHidden`: durable state, not local.
   */
  layout?: CoverLayout;
  /**
   * Persists a new `coverLayout` (PageHost's onSetCoverLayout /
   * onSetFolderCoverLayout) — only ever that field, mirroring onHide's own
   * "persist the one flag, nothing else" shape. Presence gates the
   * "Position" menu section the same way onSetCoverImage gates "Change
   * cover image", so the section only ever appears once a real handler is
   * wired — never a dead control (rule 12).
   */
  onSetLayout?: (layout: CoverLayout) => void;
  /**
   * Whether the title has a user-picked emoji (PageTitleSection/Page's own
   * `emoji` prop) — never a system icon (Daily Notes' fixed calendar
   * glyph, Page's separate `icon` prop): a fact about the resource, read
   * the same way `hidden` reads `coverHidden`, not derived from the DOM
   * here. Only ever visually relevant in Above layout (Page.Cover.css's
   * `[data-emoji-overlap]` rule is scoped to a `.page__content` ancestor,
   * which only exists there — see Page.tsx's own `coverLayout` doc
   * comment), so this prop stays a plain fact and carries no layout
   * knowledge of its own.
   */
  hasEmoji?: boolean;
};

type MenuView = 'menu' | 'picker';

/**
 * Adding, changing, and removing a cover all go through the normal render
 * flow — no loading/mount/unmount choreography of any kind. Only Hide/Show
 * (the `hidden` prop) animates, via Page.Cover.css's `[data-hidden]`
 * collapse transition; see `hidden`'s own doc comment above for how
 * PageHost keying this component by the active resource keeps that
 * transition from firing on navigation.
 */
export function PageCover({
  src,
  onRemove,
  hidden,
  onHide,
  onSetCoverImage,
  onSetCoverImageFromUpload,
  layout = 'side',
  onSetLayout,
  hasEmoji,
}: PageCoverProps) {
  const [open, setOpen] = useState(false);
  // 'menu' (Change cover image/Hide/Remove) vs 'picker' (the existing
  // ImagePicker, swapped in unwrapped, in place — same one-Overlay,
  // swap-in-place structure PageHeaderMoreActionsMenu's own root/cover
  // views already use, and for the same reason: Overlay imposes no chrome
  // of its own, so either already-self-styled surface can be hosted
  // directly without a double border/width fight.
  const [view, setView] = useState<MenuView>('menu');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suppressReturnFocusRef = useRef(false);

  // Every fresh open must start on the menu view — this component doesn't
  // unmount between opens (only its Overlay does), so `view` would
  // otherwise resume on the picker if that's where a previous open left
  // off. Render-phase reset, not a `useEffect` — same reasoning as
  // PageHeaderMoreActionsMenu's own identical reset (see its doc comment
  // for why an effect-based reset would flash the stale view for a frame).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && view !== 'menu') {
      setView('menu');
    }
  }

  if (!src) {
    return null;
  }

  function handleHide(): void {
    setOpen(false);
    // No local state to flip first: `hidden` is driven entirely by the
    // durable `coverHidden` prop, so persisting it is the whole action —
    // the collapse plays automatically once PageHost re-renders with
    // hidden: true (see [data-hidden] in Page.Cover.css).
    onHide?.();
  }

  // Shared by the root menu's own "Remove" item and ImagePicker's "hide"
  // tab (its own onRemove prop, wired below) — removal is immediate and
  // unanimated either way, through the normal `{coverImage && <PageCover
  // .../>}` unmount in Page.tsx.
  function handleRemove(): void {
    setOpen(false);
    onRemove?.();
  }

  return (
    <aside
      className="page__cover"
      data-hidden={hidden || undefined}
      data-emoji-overlap={hasEmoji || undefined}
    >
      <Button
        className="page__cover__change"
        ref={triggerRef}
        size="small"
        isIconOnly
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <AppIcon icon="moreVertical" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        side="bottom"
        alignment="end"
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        {view === 'menu' && (
          <Menu size="medium">
            {onSetCoverImage && (
              <MenuItem
                leading={<AppIcon icon="image" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setView('picker');
                }}
              >
                Change cover image
              </MenuItem>
            )}
            {onSetLayout && (
              <>
                <div className="menu__divider" role="separator" />
                <MenuGroupTitle>Position</MenuGroupTitle>
                <MenuItem
                  leading={<AppIcon icon="positionRight" />}
                  selected={layout === 'side'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    onSetLayout('side');
                  }}
                >
                  Right
                </MenuItem>
                <MenuItem
                  leading={<AppIcon icon="positionTop" />}
                  selected={layout === 'above'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    onSetLayout('above');
                  }}
                >
                  Top
                </MenuItem>
                <div className="menu__divider" role="separator" />
              </>
            )}
            <MenuItem
              leading={<AppIcon icon="hide" />}
              onClick={(event) => {
                event.stopPropagation();
                handleHide();
              }}
            >
              Hide
            </MenuItem>
            <MenuItem
              leading={<AppIcon icon="trash" />}
              onClick={(event) => {
                event.stopPropagation();
                handleRemove();
              }}
            >
              Remove
            </MenuItem>
          </Menu>
        )}

        {view === 'picker' && onSetCoverImage && (
          <div className="page__cover__picker">
            <ImagePicker
              hasCoverImage
              onClose={() => setView('menu')}
              onRemove={() => {
                setView('menu');
                handleRemove();
              }}
              onLinkSubmit={(url) => {
                setOpen(false);
                onSetCoverImage(url);
              }}
              onUploadSubmit={(sourcePath) => {
                setOpen(false);
                onSetCoverImageFromUpload?.(sourcePath);
              }}
              onUnsplashSelect={(url) => {
                // Deliberately does not close the menu — same Unsplash
                // browse-and-preview reasoning as PageHeaderMoreActionsMenu's
                // own onUnsplashSelect (ImagePicker.tsx's own doc comment).
                onSetCoverImage(url);
              }}
            />
          </div>
        )}
      </Overlay>
      <img src={src} className="page-cover__image" alt="" draggable={false} />
    </aside>
  );
}
