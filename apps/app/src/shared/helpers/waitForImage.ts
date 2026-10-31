/** How long a picture may take before it is treated as not loading. */
const IMAGE_LOAD_TIMEOUT_MS = 20_000;

/**
 * Resolves true once the picture at `url` has loaded (and decoded, where the engine can), false if it fails to load or
 * takes too long. Used to apply a new cover only when it is ready to show, so nothing appears ahead of the picture and
 * the previous cover is never replaced by one that cannot load. Never rejects.
 */
export function waitForImage(url: string, timeoutMs: number = IMAGE_LOAD_TIMEOUT_MS): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(true);
      return;
    }

    const image = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const settle = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };

    image.onload = () => {
      if (typeof image.decode === 'function') {
        image.decode().then(
          () => settle(true),
          () => settle(true)
        );
      } else {
        settle(true);
      }
    };
    image.onerror = () => settle(false);
    image.src = url;
  });
}
