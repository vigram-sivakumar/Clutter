import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject, TransitionEvent } from 'react';

/** The slot's own collapse/expand animation: the one property `.app-layout__sidebar-slot` transitions. */
const SLOT_TRANSITION_PROPERTY = 'flex-basis';

function isSlotTransitionRunning(slot: HTMLElement): boolean {
  return slot
    .getAnimations()
    .some((animation) => (animation as Animation & { transitionProperty?: string }).transitionProperty === SLOT_TRANSITION_PROPERTY);
}

/**
 * Whether toggling just started a slide worth waiting for. Where the browser reports animations (always, in the app)
 * this asks it directly — which also covers reduced motion or a zero duration, where no transition is ever created and
 * no `transitionend` would come. Without that API it falls back to the computed duration (unknown counts as "slides").
 */
function willSlide(slot: HTMLElement): boolean {
  if (typeof slot.getAnimations === 'function') {
    return isSlotTransitionRunning(slot);
  }

  const durations = getComputedStyle(slot).transitionDuration.split(',').map((value) => parseFloat(value));

  return !durations.every((value) => value === 0);
}

/**
 * Tracks the sidebar slot's collapse/expand slide from the CSS transition itself, never a timer: `transitioning` turns
 * on in the same commit as the toggle and off at the slot's `flex-basis` `transitionend`.
 *
 * Rapid toggles can't leave it stuck: a reversal replaces the running transition, so only the last one ends and clears
 * it; a toggle that leaves nothing sliding (reduced motion, or a transition that never starts) is detected right away;
 * and a cancelled transition with none left clears it too. The first render is not a toggle.
 */
export function useSidebarTransition(isVisible: boolean, slotRef: RefObject<HTMLElement>) {
  const [transitioning, setTransitioning] = useState(false);
  const previous = useRef(isVisible);

  useLayoutEffect(() => {
    if (previous.current === isVisible) {
      return;
    }
    previous.current = isVisible;

    const slot = slotRef.current;
    setTransitioning(slot ? willSlide(slot) : false);
  }, [isVisible, slotRef]);

  const onTransitionEnd = useCallback((event: TransitionEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && event.propertyName === SLOT_TRANSITION_PROPERTY) {
      setTransitioning(false);
    }
  }, []);

  // React has no `onTransitionCancel`, so this one is a native listener on the slot.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) {
      return;
    }

    const onCancel = (event: globalThis.TransitionEvent) => {
      if (event.target === slot && event.propertyName === SLOT_TRANSITION_PROPERTY) {
        // A reversal cancels the old transition while its replacement runs; only a cancel with nothing left clears.
        if (typeof slot.getAnimations !== 'function' || !isSlotTransitionRunning(slot)) {
          setTransitioning(false);
        }
      }
    };

    slot.addEventListener('transitioncancel', onCancel);

    return () => slot.removeEventListener('transitioncancel', onCancel);
  }, [slotRef]);

  return { transitioning, onTransitionEnd };
}
