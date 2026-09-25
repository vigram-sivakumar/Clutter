import { useEffect, useRef, useState } from 'react';
import type { TransitionEvent } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { ImagePicker } from './image-picker/ImagePicker';
import './Page.Cover.css';
import { AppIcon } from '@shared/icon';

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
   * the same way `src` reflects persisted `cover`. This is the
   * architectural point the "Hide" feature is built on: whether a cover
   * is hidden is a fact about the resource, not a transient animation
   * state PageCover invents locally — `removing`/`loadState` stay local
   * because they represent *this component instance's* in-flight
   * transition, not something another surface (or a reload) needs to
   * agree on.
   */
  hidden?: boolean;
  /**
   * Persists `coverHidden: true` (PageHost's onHideCoverImage /
   * onHideFolderCoverImage). Unlike Remove, this never touches `cover`
   * itself and needs no local "hiding" flag to sequence a collapse-then-
   * act: the collapse is a pure function of the `hidden` prop once it
   * flips (see [data-hidden] in Page.Cover.css) — there is no "act"
   * afterward, since hiding has nothing left to do once the box is
   * visually collapsed. `cover` staying intact is what lets a future
   * "Show" reverse straight into the entrance transition from this same
   * collapsed box, instead of remounting from scratch.
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
};

type MenuView = 'menu' | 'picker';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Three states, not two: `pending` (default — this image hasn't resolved
 * yet, stay collapsed), `ready` (loaded successfully — play the normal
 * entrance transition), `failed` (errored — never treated as a
 * successful load; see Page.Cover.css's `[data-load-failed]` rule for
 * why this is a *snap* to the expanded box, not an animated entrance).
 * Kept as one union rather than two booleans specifically so "loaded"
 * and "failed" can never both be true at once.
 */
type LoadState = 'pending' | 'ready' | 'failed';

/**
 * Two mirrored, one-directional transitions share the same mechanism —
 * .page__cover's own `flex-basis` (Page.Cover.css) — and the same
 * always-present box: entering (this image hasn't finished loading yet,
 * so stay collapsed) and removing (the user asked to remove it, so
 * collapse again before actually leaving). Neither ever touches the
 * cover's defined width/height or reads the image's intrinsic size —
 * `loadState` only gates *when* the box is allowed to expand into the
 * space CSS already allocates it, never *how big* it expands to.
 *
 * A failed image is deliberately NOT the same outcome as a loaded one:
 * it still ends up at the expanded box size (so More Actions/Remove
 * stays reachable — a cover that fails to load, e.g. dead external link
 * rot on an already-persisted cover, shouldn't become a permanent,
 * unreachable dead end), but gets there as an instant snap, never the
 * animated entrance a real successful load gets. See
 * Page.Cover.css's `[data-load-failed]:not([data-removing])` rule.
 * Nothing here modifies the persisted cover on failure — this is a
 * purely presentational distinction.
 *
 * "Remove" doesn't call onRemove synchronously — it flips `removing`,
 * which triggers the same collapse transition. Only once that transition
 * actually finishes (the `transitionend` handler below, guarded so it
 * only fires the real removal for this direction, not the entry one —
 * see its own comment) does the real removal fire. This is what keeps
 * the cover mounted throughout the collapse instead of popping out
 * instantly — if `src` disappeared the moment "Remove" was clicked,
 * Page.tsx's own `{coverImage && <PageCover .../>}` would unmount this
 * component before any of that CSS transition ever had a chance to run.
 *
 * "Hide" is a third, simpler case built on the same collapse mechanism
 * but with no local sequencing state of its own: unlike `removing`,
 * `hidden` isn't something this component decides — it's a prop mirroring
 * the persisted `coverHidden` metadata, so onHide's whole job is
 * persisting `coverHidden: true` and letting the resulting prop change
 * drive `[data-hidden]`'s collapse the normal React-render way, same as
 * `src` changing drives `[data-loading]`'s. There is nothing to do once
 * that collapse finishes — no `onTransitionEnd` branch, no unmount — the
 * box simply stays mounted, collapsed, with `cover` untouched, ready for
 * a future "Show" to reverse straight back into the entrance transition.
 */
export function PageCover({
  src,
  onRemove,
  hidden,
  onHide,
  onSetCoverImage,
  onSetCoverImageFromUpload,
}: PageCoverProps) {
  const [open, setOpen] = useState(false);
  // 'menu' (Change cover image/Hide/Remove) vs 'picker' (the existing
  // ImagePicker, swapped in unwrapped, in place — same one-Overlay,
  // swap-in-place structure PageHeaderMoreActionsMenu's own root/cover
  // views already use, and for the same reason: Overlay imposes no chrome
  // of its own, so either already-self-styled surface can be hosted
  // directly without a double border/width fight.
  const [view, setView] = useState<MenuView>('menu');
  const [removing, setRemoving] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('pending');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suppressReturnFocusRef = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);

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

  // Re-arms on every src change (a fresh cover, or an existing one
  // replaced) — each one gets its own "wait for this image" gate rather
  // than inheriting a previous image's readiness.
  useEffect(() => {
    if (prefersReducedMotion()) {
      // No entrance transition to wait for — show as soon as the
      // element exists, matching the removal side's own reduced-motion
      // shortcut in performRemove below. Whether this particular image
      // will actually load doesn't matter here: [data-load-failed]'s
      // only job is suppressing an *animation* that the reduced-motion
      // media query already suppresses globally.
      setLoadState('ready');
      return;
    }
    setLoadState('pending');
    // Covers the case where the browser resolves the image from cache
    // before this effect's onLoad/onError listeners below would
    // otherwise catch it (this is now the *common* case, not an edge
    // case — the image picker itself already preloaded this exact URL
    // moments before the write that mounts this component, so the
    // browser's HTTP cache almost always already has it).
    // `naturalWidth > 0` is what actually distinguishes a successfully-
    // decoded cached image from a cached failure — `.complete` alone is
    // true for both.
    const img = imgRef.current;
    if (!img?.complete) {
      return;
    }
    // Flipping straight to ready/failed here, in the same effect
    // execution as the `setLoadState('pending')` above, would let React
    // batch both updates into one commit with no real paint of the
    // collapsed frame in between — the box would mount already at full
    // size instead of animating in. Deferring across two rAFs forces a
    // genuine paint boundary: the first rAF runs after the browser has
    // painted the 'pending'/collapsed commit, and the second rAF's
    // callback is what actually flips the state, so the CSS transition
    // always has a real prior frame to animate from. Not a JS animation
    // loop — this fires once per src change, CSS still owns the motion.
    let cancelled = false;
    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        setLoadState(img.naturalWidth > 0 ? 'ready' : 'failed');
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) {
        cancelAnimationFrame(secondFrame);
      }
    };
  }, [src]);

  if (!src) {
    return null;
  }

  function handleImageLoad(): void {
    setLoadState('ready');
  }

  function handleImageError(): void {
    setLoadState('failed');
  }

  // Shared by the root menu's own "Remove" item and ImagePicker's "hide"
  // tab (its own onRemove prop, wired below) — one removal sequence
  // regardless of which surface requested it, not a second copy that
  // skips the collapse animation.
  function performRemove(): void {
    // Reduced motion isn't the only case with no collapse left to
    // animate: a hidden cover is already sitting at flex-basis: 0/
    // flex-grow: 0 (Page.Cover.css's [data-hidden]), so setting
    // `removing` too would change nothing — no transitionend would ever
    // fire, and onRemove() (called only from that handler below) would
    // never run, leaving the cover stuck mounted forever. Same shortcut
    // as reduced motion, for the same underlying reason: nothing left to
    // visually collapse, so act immediately instead of waiting on an
    // animation that can't happen.
    if (prefersReducedMotion() || hidden) {
      onRemove?.();
      return;
    }
    setRemoving(true);
  }

  function handleHide(): void {
    setOpen(false);
    // No local state to flip first: `hidden` is driven entirely by the
    // durable `coverHidden` prop, so persisting it is the whole action —
    // the collapse plays automatically once PageHost re-renders with
    // hidden: true (see [data-hidden] in Page.Cover.css), the same way
    // `[data-loading]`'s collapse already plays from a prop/state change
    // rather than an imperative animation call.
    onHide?.();
  }

  function handleRemove(): void {
    setOpen(false);
    performRemove();
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLElement>): void {
    // Ignore bubbled transitions from descendants (e.g. the More-actions
    // button's own opacity hover-transition) — only this element's own
    // flex-basis collapse should ever be considered here.
    if (event.target !== event.currentTarget) {
      return;
    }
    // The same property/element transitions for both entering (collapsed
    // -> expanded, once ready) and removing (expanded -> collapsed, once
    // requested) — only the removing direction should ever trigger the
    // real removal. Without this guard, the entry transition finishing
    // would immediately remove the cover the instant it finished
    // appearing.
    if (removing) {
      onRemove?.();
    }
  }

  return (
    <aside
      className="page__cover"
      data-loading={loadState === 'pending' || undefined}
      data-load-failed={loadState === 'failed' || undefined}
      data-removing={removing || undefined}
      data-hidden={hidden || undefined}
      onTransitionEnd={handleTransitionEnd}
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
        ref={imgRef}
        src={src}
        className="page-cover__image"
        alt=""
        draggable={false}
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </aside>
  );
}
