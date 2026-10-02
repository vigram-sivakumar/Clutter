import { useEffect, useState } from 'react';

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
