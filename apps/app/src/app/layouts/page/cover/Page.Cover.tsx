import { useEffect, useRef, useState } from 'react';
import type { TransitionEvent } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
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
};

const MENU_ITEMS: OverflowMenuItemConfig[] = [{ id: 'remove', label: 'Remove', icon: 'trash' }];

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
 */
export function PageCover({ src, onRemove }: PageCoverProps) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('pending');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suppressReturnFocusRef = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Re-arms on every src change (a fresh cover, or an existing one
  // replaced) — each one gets its own "wait for this image" gate rather
  // than inheriting a previous image's readiness.
  useEffect(() => {
    if (prefersReducedMotion()) {
      // No entrance transition to wait for — show as soon as the
      // element exists, matching the removal side's own reduced-motion
      // shortcut in handleSelect below. Whether this particular image
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

  function handleSelect(id: string): void {
    if (id !== 'remove') {
      return;
    }
    if (prefersReducedMotion()) {
      onRemove?.();
      return;
    }
    setRemoving(true);
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
      onTransitionEnd={handleTransitionEnd}
    >
      <Button
        className="page__cover__change"
        ref={triggerRef}
        size="small"
        isIconOnly
        aria-haspopup="menu"
        aria-expanded={open}
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
        <OverflowMenuBody
          items={MENU_ITEMS}
          onSelect={handleSelect}
          onOpenChange={setOpen}
          suppressReturnFocusRef={suppressReturnFocusRef}
        />
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
