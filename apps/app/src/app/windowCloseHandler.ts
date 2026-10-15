/**
 * How long a close request waits for a vault bootstrap that is still running
 * before the window is closed anyway.
 */
export const BOOTSTRAP_CLOSE_WAIT_MS = 10_000;

interface ClosableApplication {
  close(): Promise<void>;
}

interface WindowCloseDeps {
  /** The in-flight (or finished) vault bootstrap, or null before one has started. */
  getBootstrap: () => Promise<unknown> | null;
  /** The opened Application, or null while it doesn't exist yet. */
  getApplication: () => ClosableApplication | null;
  destroyWindow: () => Promise<void>;
  bootstrapWaitMs?: number;
}

/**
 * Builds the window close-request handler. It is registered before the vault
 * bootstrap starts, so `Application` may not exist when a close request
 * arrives:
 *
 * - Bootstrap still running: wait for it (bounded) before closing. Bootstrap
 *   can write — duplicate-ID repair, archive/template reconciliation — and
 *   destroying the window mid-write could leave a half-written note.
 * - Application open: close it (flushes dirty content) before the window goes,
 *   exactly as before.
 * - Repeated close requests (e.g. another click on the close button while the
 *   first is waiting) share the one in-flight close instead of starting a
 *   second. A close that fails can be requested again.
 */
export function createWindowCloseHandler(deps: WindowCloseDeps) {
  const waitMs = deps.bootstrapWaitMs ?? BOOTSTRAP_CLOSE_WAIT_MS;
  let closing: Promise<void> | null = null;

  async function closeOnce(): Promise<void> {
    const bootstrap = deps.getBootstrap();
    if (bootstrap) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      });
      await Promise.race([bootstrap.then(noop, noop), timeout]);
      clearTimeout(timer);
    }
    await deps.getApplication()?.close();
    await deps.destroyWindow();
  }

  return async (event: { preventDefault(): void }): Promise<void> => {
    event.preventDefault();
    closing ??= closeOnce();
    try {
      await closing;
    } catch (error) {
      closing = null;
      console.error('Failed to close the window cleanly:', error);
    }
  };
}

function noop(): void {}
