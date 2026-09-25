import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { EmojiTray } from '@components/emoji-tray/EmojiTray';
import { ImagePicker } from '@app/layouts/page/cover/image-picker/ImagePicker';
import { AppIcon } from '@shared/icon';
import './PageHeaderMoreActionsMenu.css';

export interface PageHeaderMoreActionsMenuProps {
  /** The page's current emoji, if any — gates whether the root view offers "Emoji" at all (only when unset; a set emoji's own button is the entry point instead, see PageHeaderControls). */
  emoji?: string;
  /**
   * Presence gates the entire Emoji capability, the same "handler presence
   * decides whether the menu item exists" convention
   * ResourceTopBarActionsProps.onSetCoverImage already establishes —
   * `undefined` for Daily Notes, which show More actions but never an
   * emoji control.
   */
  onSelectEmoji?: (emoji: string) => void;
  onRemoveEmoji?: () => void;
  /** Gates whether the root view offers "Cover image" at all (only when unset; the cover thumbnail itself is the entry point once one exists, see PageHeaderControls) — same convention as `emoji` above. */
  hasCoverImage: boolean;
  /**
   * Whether an existing cover is currently suppressed from view
   * (`coverHidden` metadata — see PageHeaderControls' own doc comment).
   * Only meaningful when `hasCoverImage` is true; swaps the root view's
   * conceptual "Cover image" slot for "Show cover image" instead of
   * omitting it, the same way a visible cover replaces it with
   * `onRemoveCoverImage`'s existing "Hide cover image" entry point
   * elsewhere (PageCover's own overflow menu).
   */
  coverHidden?: boolean;
  /** Presence (alongside `!hasCoverImage`) gates the "Cover image" item, same convention as onSelectEmoji above. */
  onSetCoverImage?: (url: string) => void;
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  onRemoveCoverImage?: () => void;
  /**
   * Presence (alongside `hasCoverImage && coverHidden`) gates the "Show
   * cover image" item. Unlike "Cover image" above, clicking it never opens
   * the picker view — it only flips the persisted `coverHidden` flag back
   * to `false` (PageHost's onShowCoverImage/onShowFolderCoverImage, same
   * updateMetadata write path as onHideCoverImage), leaving the existing
   * `cover` untouched.
   */
  onShowCoverImage?: () => void;
}

type MenuView = 'root' | 'emoji' | 'cover';

/**
 * The page header's "More actions" menu. Structurally, this is one
 * `Overlay` whose content swaps by `view` — never a nested `Overlay`, and
 * never more than one mounted at a time:
 *
 *   Overlay
 *   ├── 'root'  → <Menu> (Emoji/Cover image/Description items)
 *   ├── 'emoji' → the existing EmojiTray, unwrapped
 *   └── 'cover' → the existing ImagePicker, unwrapped
 *
 * `EmojiTray` and `ImagePicker` are each already a complete, self-styled
 * surface (own background/border-radius/box-shadow/padding — see either
 * component's own CSS), the same as `ChangeIconPicker`
 * (Popover+EmojiTray) and ResourceTopBarActions' own Popover+ImagePicker
 * already treat them elsewhere. `Menu` is *also* a complete, self-styled
 * surface (`Menu.css`'s own background/padding/fixed width) — rendering
 * either picker *inside* `Menu`, as an earlier version of this file did,
 * nested two independently-chromed surfaces inside one another (Menu's
 * own border visible around the picker's own border, and Menu's fixed
 * 220px width constraining whichever picker was showing). `Overlay`
 * itself imposes no visual chrome at all (Overlay.css has no
 * background/border/padding — purely positioning and the entrance
 * animation), which is exactly why it can host any one of these three
 * already-chromed surfaces directly, unwrapped, without a double border
 * or a second component's width fighting the first.
 *
 * This reuses the same one-Overlay, swap-in-place transition
 * FencedCodeActionsMenu.tsx's Change Language view and
 * CollectionViewMenu.tsx's Properties view established — the *view*
 * being swapped just isn't always another `<Menu>` here, because Emoji
 * and Cover image aren't lists of `MenuItem`s the way Properties/Change
 * Language are; they're pre-built pickers with their own layout.
 *
 * Neither EmojiTray nor ImagePicker is modified to fit here — both are
 * reused verbatim, with no extra title/back row of this file's own
 * wrapped around either. ImagePicker already has its own header/dismiss
 * button (`.image-picker__header`); it's repointed to `setView('root')`
 * instead of a full close, so it doubles as this menu's "back to More
 * actions" for the cover view. EmojiTray has no such control of its own
 * — there's deliberately no substitute added here either, so leaving the
 * emoji view is via Escape/backdrop click (`Overlay`'s own `onClose`),
 * same as `ChangeIconPicker`'s existing standalone usage already works.
 *
 * Description has no existing edit UI anywhere in the app today (only an
 * inert top-bar menu item and an unused `updateDescription` data path) —
 * per the "do not invent new architecture" instruction, its item renders
 * but is not wired to anything yet.
 */
export function PageHeaderMoreActionsMenu({
  emoji,
  onSelectEmoji,
  onRemoveEmoji,
  hasCoverImage,
  coverHidden,
  onSetCoverImage,
  onSetCoverImageFromUpload,
  onRemoveCoverImage,
  onShowCoverImage,
}: PageHeaderMoreActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('root');
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Every fresh open must start on the root view — this component itself
  // never unmounts between opens (only its Overlay does), so `view` would
  // otherwise resume wherever the previous open left off. Render-phase
  // reset, not a `useEffect` — see CollectionViewMenu.tsx's own doc
  // comment for why an effect-based reset would flash the stale view for
  // one frame before correcting itself.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && view !== 'root') {
      setView('root');
    }
  }

  const showEmojiItem = Boolean(onSelectEmoji) && !emoji;
  // Same "omit once set, the thumbnail itself becomes the entry point"
  // convention as Emoji above, mirrored for Cover image now that
  // PageHeaderControls renders its own cover thumbnail button. Only
  // offered when there is no cover at all — a hidden cover still counts
  // as existing (see showShowCoverImageItem below), it's just not shown.
  const showCoverItem = Boolean(onSetCoverImage) && !hasCoverImage;
  // The hidden-cover counterpart: replaces the (now-omitted) "Cover
  // image" slot with "Show cover image" — reveals the existing cover via
  // onShowCoverImage alone, never the picker.
  const showShowCoverImageItem = hasCoverImage && Boolean(coverHidden) && Boolean(onShowCoverImage);

  return (
    <>
      <Button
        className="page-header-controls__menu"
        ref={anchorRef}
        variant="outline-fill"
        isIconOnly
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => setOpen((value) => !value)}
      >
        <AppIcon icon="moreHorizontal" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="start"
      >
        {view === 'root' && (
          <Menu size="medium">
            {showEmojiItem && (
              <MenuItem
                leading={<AppIcon icon="smile" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setView('emoji');
                }}
              >
                Emoji
              </MenuItem>
            )}
            {showCoverItem && (
              <MenuItem
                leading={<AppIcon icon="image" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setView('cover');
                }}
              >
                Cover image
              </MenuItem>
            )}
            {showShowCoverImageItem && (
              <MenuItem
                leading={<AppIcon icon="image" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onShowCoverImage?.();
                }}
              >
                Show cover image
              </MenuItem>
            )}
            <MenuItem
              leading={<AppIcon icon="description" />}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
            >
              Description
            </MenuItem>
          </Menu>
        )}

        {view === 'emoji' && (
          <EmojiTray
            hasIcon={Boolean(emoji)}
            onSelect={(selected) => {
              onSelectEmoji?.(selected);
              setOpen(false);
            }}
            onRemove={() => {
              onRemoveEmoji?.();
              setOpen(false);
            }}
          />
        )}

        {view === 'cover' && onSetCoverImage && (
          <div className="page-header-more-actions-menu__cover">
            <ImagePicker
              hasCoverImage={hasCoverImage}
              onClose={() => setView('root')}
              onRemove={() => {
                onRemoveCoverImage?.();
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
                // browse-and-preview reasoning as ResourceTopBarActions'
                // own onUnsplashSelect (ImagePicker.tsx's own doc
                // comment).
                onSetCoverImage(url);
              }}
            />
          </div>
        )}
      </Overlay>
    </>
  );
}
