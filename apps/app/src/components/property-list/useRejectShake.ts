import { useEffect, useRef, useState, type RefObject } from 'react';

import { SHAKE_DURATION_MS } from '@components/editable-text/EditableText';
// For the shared `editable-text--shake` reject animation.
import '@components/editable-text/EditableText.css';

/**
 * EditableText's "that value isn't accepted" shake, for a Property value
 * input that rejects an Enter: `shake()` starts it, and `shakeClassName`
 * (the same `editable-text--shake` class, cleared after the same
 * SHAKE_DURATION_MS) goes on the element to animate. Not a second
 * feedback mechanism — the identical animation, wired for an Input.
 */
export function useRejectShake(): { shakeClassName: string | false; shake(): void } {
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (!isShaking) {
      return;
    }

    const timeout = setTimeout(() => setIsShaking(false), SHAKE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [isShaking]);

  return {
    shakeClassName: isShaking && 'editable-text--shake',
    shake: () => setIsShaking(true),
  };
}

/**
 * The same shake for a required field a button was pressed without: the button stays enabled, and `shake()` plays
 * the animation on the field behind `ref` (put `ref` on an `Input`: its className goes on the wrapper, so the class
 * is added to the native field itself).
 */
export function useRejectShakeField<T extends HTMLElement>(): { ref: RefObject<T>; shake(): void } {
  const ref = useRef<T>(null);
  const { shakeClassName, shake } = useRejectShake();

  useEffect(() => {
    const field = ref.current;
    if (!field || !shakeClassName) {
      return;
    }

    field.classList.add(shakeClassName);
    return () => field.classList.remove(shakeClassName);
  }, [shakeClassName]);

  return { ref, shake };
}
