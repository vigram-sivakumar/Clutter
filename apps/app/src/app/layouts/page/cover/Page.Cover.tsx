import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
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
   * The saved (not preview) focal position for the *current* `layout` —
   * PageHost passes both PageMetadata.coverPositionAbove and
   * coverPositionSide down through Page.tsx, but this component only ever
   * reads whichever one `layout` selects (see `savedPosition` below); it
   * never combines them or reads the other layout's value. Each defaults
   * to 50 (centered) — undefined is treated identically to 50, matching
   * "missing values render as centered" (no migration needed).
   */
  coverPositionAbove?: number;
  coverPositionSide?: number;
  /**
   * Persists the currently-previewed drag position for the active layout
   * only (PageHost's onSaveCoverPosition/onSaveFolderCoverPosition) — the
   * one point a local drag preview becomes durable metadata. Presence
   * gates the "Reposition" menu item and the "Save Position" button the
   * same way onSetLayout gates "Position", so reposition is never a dead
   * control before a real handler exists (rule 12).
   */
  onSavePosition?: (layout: CoverLayout, position: number) => void;
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
  coverPositionAbove,
  coverPositionSide,
  onSavePosition,
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

  // Repositioning is local, unsaved UI state — see this component's own
  // module doc comment and the `onSavePosition` prop's doc comment above.
  // `dragPreview` is null whenever there is no live, unsaved drag in
  // progress (initial mount, after Save Position, after Escape-cancel) —
  // `effectivePosition` below falls back to the durable saved value
  // whenever it's null, which is what makes "ends without Save Position"
  // a no-op on persisted metadata for free, with no separate revert step.
  const [repositioning, setRepositioning] = useState(false);
  const [dragPreview, setDragPreview] = useState<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // Gates pointermove while a real drag (pointerdown -> pointerup) is in
  // progress — plain hover already fires pointermove on the image with no
  // button held, which must never move the preview. A ref, not state: it
  // never needs to trigger a render on its own, only dragPreview does.
  const isDraggingRef = useRef(false);

  // Switching `coverLayout` (the Right/Top menu items) mid-reposition would
  // otherwise leave a stale single-axis `dragPreview` computed against the
  // *previous* layout's axis silently reinterpreted against the new one.
  // Render-phase reset on the one dependency that matters, same idiom as
  // the `view` reset above — not a `useEffect`, for the same
  // no-stale-frame reason.
  const [previousLayout, setPreviousLayout] = useState(layout);
  if (layout !== previousLayout) {
    setPreviousLayout(layout);
    setRepositioning(false);
    setDragPreview(null);
  }

  // Escape is the one way to end repositioning without saving (spec: "If
  // repositioning mode ends without Save Position, the unsaved preview
  // must not become the persisted cover position"). Scoped to document,
  // not the image, since focus may be anywhere once a drag ends.
  useEffect(() => {
    if (!repositioning) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setRepositioning(false);
        setDragPreview(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [repositioning]);

  if (!src) {
    return null;
  }

  // The saved (durable) position for whichever axis `layout` currently
  // selects — Above and Side never combine into one 2D position (spec
  // §10), so only one of the two props is ever read here. Undefined
  // (frontmatter omitted the field) and the explicit default both mean
  // centered — same "missing means 50" contract resolvePageMetadata/
  // FolderBuilder already apply when persisting.
  const savedPosition =
    layout === 'above' ? (coverPositionAbove ?? 50) : (coverPositionSide ?? 50);
  // The value actually rendered: the live drag preview while one exists,
  // otherwise the durable saved position. This is the single source both
  // the `<img>`'s object-position and the eventual Save Position call
  // read from, so "what you see while dragging" and "what gets persisted"
  // can never drift apart.
  const effectivePosition = dragPreview ?? savedPosition;

  function computePositionFromPointer(event: { clientX: number; clientY: number }): number {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) {
      return effectivePosition;
    }
    // Above moves vertically only, Side moves horizontally only — the
    // unused axis is never read, let alone written (spec §4/§5: "Movement
    // on the unsupported axis has no effect").
    const raw =
      layout === 'above'
        ? ((event.clientY - rect.top) / rect.height) * 100
        : ((event.clientX - rect.left) / rect.width) * 100;
    // Values outside 0-100 must not be persisted (spec §9) — clamped here,
    // at the one place a position value originates, rather than validated
    // later at the write call.
    return Math.min(100, Math.max(0, raw));
  }

  function handleImagePointerDown(event: ReactPointerEvent<HTMLImageElement>): void {
    // setPointerCapture routes every subsequent event for this pointerId to
    // this element regardless of where the pointer physically moves to,
    // which is what lets a drag continue correctly even if the cursor
    // leaves the image's bounds mid-gesture.
    event.currentTarget.setPointerCapture(event.pointerId);
    isDraggingRef.current = true;
    setDragPreview(computePositionFromPointer(event));
  }

  function handleImagePointerMove(event: ReactPointerEvent<HTMLImageElement>): void {
    if (!isDraggingRef.current) {
      return;
    }
    setDragPreview(computePositionFromPointer(event));
  }

  function handleImagePointerUp(): void {
    isDraggingRef.current = false;
  }

  function handleEnterRepositioning(event: { stopPropagation(): void }): void {
    event.stopPropagation();
    setOpen(false);
    // Re-entering always starts from the currently saved position (spec
    // §14) — dragPreview stays null until the first actual drag, so
    // `effectivePosition` above already resolves to `savedPosition` the
    // instant repositioning mode turns on, with nothing further to set here.
    setDragPreview(null);
    setRepositioning(true);
  }

  function handleSavePosition(event: { stopPropagation(): void }): void {
    event.stopPropagation();
    onSavePosition?.(layout, effectivePosition);
    setRepositioning(false);
    setDragPreview(null);
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
      data-repositioning={repositioning || undefined}
    >
      <div className="page__cover__actions">
        {repositioning && (
          <Button size="small" variant="filled" onClick={handleSavePosition}>
            Save Position
          </Button>
        )}
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
      </div>
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
                {onSavePosition && (
                  <MenuItem
                    leading={<AppIcon icon="moveRight" />}
                    onClick={handleEnterRepositioning}
                  >
                    Reposition
                  </MenuItem>
                )}
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
      <img
        ref={imageRef}
        src={src}
        className="page-cover__image"
        alt=""
        draggable={false}
        style={{
          objectPosition:
            layout === 'above'
              ? `50% ${effectivePosition}%`
              : `${effectivePosition}% 50%`,
        }}
        onPointerDown={repositioning ? handleImagePointerDown : undefined}
        onPointerMove={repositioning ? handleImagePointerMove : undefined}
        onPointerUp={repositioning ? handleImagePointerUp : undefined}
      />
    </aside>
  );
}
