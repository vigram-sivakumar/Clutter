/**
 * How long a close request waits for a vault bootstrap that is still running
 * before the window is closed anyway.
 */
export const BOOTSTRAP_CLOSE_WAIT_MS = 10_000;

/** Emitted by the native Quit item (src-tauri/src/app_menu.rs): asks the page to run the same close as the window's close button. */
export const QUIT_MENU_EVENT = 'menu:quit';

interface ClosableApplication {
  close(): Promise<void>;
  /**
   * One bounded flush, then how many open pages still hold changes that are not safely saved (see
   * `Application.checkUnsavedBeforeClose`). Optional so an application with nothing to check closes as before.
   */
  checkUnsavedBeforeClose?(): Promise<number>;
}

/** What the user chose when asked about unsaved changes: close and lose them, or go back to the document. */
export type UnsavedCloseChoice = 'close' | 'cancel';

interface WindowCloseDeps {
  /** The in-flight (or finished) vault bootstrap, or null before one has started. */
  getBootstrap: () => Promise<unknown> | null;
  /** The opened Application, or null while it doesn't exist yet. */
  getApplication: () => ClosableApplication | null;
  destroyWindow: () => Promise<void>;
  bootstrapWaitMs?: number;
  /**
   * Asks the user what to do when `unsavedCount` pages still have unsaved changes after the flush. Without it a
   * close with unsaved changes is cancelled, never carried out silently.
   */
  confirmUnsavedClose?: (unsavedCount: number) => Promise<UnsavedCloseChoice>;
}

/**
 * Builds the window close-request handler. It is registered before the vault
 * bootstrap starts, so `Application` may not exist when a close request
 * arrives:
 *
 * - Bootstrap still running: wait for it (bounded) before closing. Bootstrap
 *   can write — duplicate-ID repair, archive/template reconciliation — and
 *   destroying the window mid-write could leave a half-written note.
 * - Application open: flush once, and if anything is still unsaved ask the user
 *   (`confirmUnsavedClose`) before doing anything else. Cancel leaves the window and
 *   every open document exactly as they were; only an explicit "close" proceeds. A
 *   flush that was attempted is never treated as a save that happened. Then close the
 *   application and the window, as before.
 * - Repeated close requests (e.g. another click on the close button while the
 *   first is waiting, or a ⌘Q while the dialog is open) share the one in-flight
 *   close instead of starting a second, so there is never a second dialog. A
 *   close that fails, or that the user cancelled, can be requested again.
 */
export function createWindowCloseHandler(deps: WindowCloseDeps) {
  const waitMs = deps.bootstrapWaitMs ?? BOOTSTRAP_CLOSE_WAIT_MS;
  let closing: Promise<'closed' | 'cancelled'> | null = null;

  async function closeOnce(): Promise<'closed' | 'cancelled'> {
    const bootstrap = deps.getBootstrap();
    if (bootstrap) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      });
      await Promise.race([bootstrap.then(noop, noop), timeout]);
      clearTimeout(timer);
    }
    const application = deps.getApplication();
    if (application) {
      const unsaved = (await application.checkUnsavedBeforeClose?.()) ?? 0;
      if (unsaved > 0) {
        const choice = deps.confirmUnsavedClose ? await deps.confirmUnsavedClose(unsaved) : 'cancel';
        if (choice !== 'close') {
          return 'cancelled';
        }
      }
      await application.close();
    }
    await deps.destroyWindow();
    return 'closed';
  }

  return async (event: { preventDefault(): void }): Promise<void> => {
    event.preventDefault();
    closing ??= closeOnce();
    try {
      if ((await closing) === 'cancelled') {
        closing = null;
      }
    } catch (error) {
      closing = null;
      console.error('Failed to close the window cleanly:', error);
    }
  };
}

function noop(): void {}
