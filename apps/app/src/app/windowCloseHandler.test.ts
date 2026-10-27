import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWindowCloseHandler } from './windowCloseHandler';

function event() {
  return { preventDefault: vi.fn() };
}

describe('createWindowCloseHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prevents the native close, closes the application, then destroys the window', async () => {
    const calls: string[] = [];
    const handler = createWindowCloseHandler({
      getBootstrap: () => Promise.resolve(),
      getApplication: () => ({
        close: async () => void calls.push('application.close'),
      }),
      destroyWindow: async () => void calls.push('destroyWindow'),
    });
    const e = event();

    await handler(e);

    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(calls).toEqual(['application.close', 'destroyWindow']);
  });

  it('destroys the window when no bootstrap has started and there is no application', async () => {
    const destroyWindow = vi.fn(async () => {});
    const handler = createWindowCloseHandler({
      getBootstrap: () => null,
      getApplication: () => null,
      destroyWindow,
    });

    await handler(event());

    expect(destroyWindow).toHaveBeenCalledOnce();
  });

  it('waits for an in-flight bootstrap, then closes the application it produced', async () => {
    const calls: string[] = [];
    let application: { close: () => Promise<void> } | null = null;
    let finishBootstrap!: () => void;
    const bootstrap = new Promise<void>((resolve) => {
      finishBootstrap = () => {
        application = {
          close: async () => void calls.push('application.close'),
        };
        calls.push('bootstrap finished');
        resolve();
      };
    });
    const handler = createWindowCloseHandler({
      getBootstrap: () => bootstrap,
      getApplication: () => application,
      destroyWindow: async () => void calls.push('destroyWindow'),
    });

    const closing = handler(event());
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([]); // still waiting: nothing closed mid-bootstrap

    finishBootstrap();
    await closing;

    expect(calls).toEqual([
      'bootstrap finished',
      'application.close',
      'destroyWindow',
    ]);
  });

  it('closes the window anyway when bootstrap never settles', async () => {
    const destroyWindow = vi.fn(async () => {});
    const handler = createWindowCloseHandler({
      getBootstrap: () => new Promise<void>(() => {}),
      getApplication: () => null,
      destroyWindow,
      bootstrapWaitMs: 5000,
    });

    const closing = handler(event());
    await vi.advanceTimersByTimeAsync(4999);
    expect(destroyWindow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await closing;

    expect(destroyWindow).toHaveBeenCalledOnce();
  });

  it('treats a failed bootstrap like a finished one', async () => {
    const destroyWindow = vi.fn(async () => {});
    const handler = createWindowCloseHandler({
      getBootstrap: () => Promise.reject(new Error('scan failed')),
      getApplication: () => null,
      destroyWindow,
    });

    await handler(event());

    expect(destroyWindow).toHaveBeenCalledOnce();
  });

  it('shares one close between repeated requests', async () => {
    const close = vi.fn(async () => {});
    const destroyWindow = vi.fn(async () => {});
    const handler = createWindowCloseHandler({
      getBootstrap: () => null,
      getApplication: () => ({ close }),
      destroyWindow,
    });
    const first = event();
    const second = event();

    await Promise.all([handler(first), handler(second)]);

    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(destroyWindow).toHaveBeenCalledOnce();
  });

  it('lets a later request retry after a failed close, without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const close = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('flush failed'))
      .mockResolvedValueOnce(undefined);
    const destroyWindow = vi.fn(async () => {});
    const handler = createWindowCloseHandler({
      getBootstrap: () => null,
      getApplication: () => ({ close }),
      destroyWindow,
    });

    await handler(event());
    expect(destroyWindow).not.toHaveBeenCalled();

    await handler(event());
    expect(close).toHaveBeenCalledTimes(2);
    expect(destroyWindow).toHaveBeenCalledOnce();
  });

  describe('with unsaved changes', () => {
    function application(unsaved: number) {
      return {
        close: vi.fn(async () => {}),
        checkUnsavedBeforeClose: vi.fn(async () => unsaved),
      };
    }

    it('closes without asking when nothing is unsaved', async () => {
      const app = application(0);
      const confirmUnsavedClose = vi.fn(async () => 'close' as const);
      const destroyWindow = vi.fn(async () => {});
      const handler = createWindowCloseHandler({
        getBootstrap: () => null,
        getApplication: () => app,
        destroyWindow,
        confirmUnsavedClose,
      });

      await handler(event());

      expect(confirmUnsavedClose).not.toHaveBeenCalled();
      expect(app.close).toHaveBeenCalledOnce();
      expect(destroyWindow).toHaveBeenCalledOnce();
    });

    it('offers the user a choice, and closes nothing until they answer', async () => {
      const app = application(2);
      let answer!: (choice: 'close' | 'cancel') => void;
      const confirmUnsavedClose = vi.fn(
        () => new Promise<'close' | 'cancel'>((resolve) => (answer = resolve))
      );
      const destroyWindow = vi.fn(async () => {});
      const handler = createWindowCloseHandler({
        getBootstrap: () => null,
        getApplication: () => app,
        destroyWindow,
        confirmUnsavedClose,
      });

      const closing = handler(event());
      await vi.advanceTimersByTimeAsync(0);

      expect(confirmUnsavedClose).toHaveBeenCalledWith(2);
      expect(app.close).not.toHaveBeenCalled();
      expect(destroyWindow).not.toHaveBeenCalled();

      answer('close');
      await closing;

      expect(app.close).toHaveBeenCalledOnce();
      expect(destroyWindow).toHaveBeenCalledOnce();
    });

    it('cancelling keeps the window and the application open, untouched, and asks again next time', async () => {
      const app = application(1);
      const confirmUnsavedClose = vi
        .fn<(count: number) => Promise<'close' | 'cancel'>>()
        .mockResolvedValueOnce('cancel')
        .mockResolvedValueOnce('close');
      const destroyWindow = vi.fn(async () => {});
      const handler = createWindowCloseHandler({
        getBootstrap: () => null,
        getApplication: () => app,
        destroyWindow,
        confirmUnsavedClose,
      });

      await handler(event());

      expect(app.close).not.toHaveBeenCalled(); // nothing disposed: the open documents keep their content
      expect(destroyWindow).not.toHaveBeenCalled();

      await handler(event());

      expect(confirmUnsavedClose).toHaveBeenCalledTimes(2);
      expect(app.close).toHaveBeenCalledOnce();
      expect(destroyWindow).toHaveBeenCalledOnce();
    });

    it('a flush that did not save everything cannot close the app silently, even with no dialog available', async () => {
      const app = application(1); // the flush ran and failed: one page is still unsaved
      const destroyWindow = vi.fn(async () => {});
      const handler = createWindowCloseHandler({
        getBootstrap: () => null,
        getApplication: () => app,
        destroyWindow,
      });

      await handler(event());

      expect(app.checkUnsavedBeforeClose).toHaveBeenCalledOnce();
      expect(app.close).not.toHaveBeenCalled();
      expect(destroyWindow).not.toHaveBeenCalled();
    });

    it('repeated close requests while the dialog is open (close button, ⌘Q) share one dialog', async () => {
      const app = application(1);
      let answer!: (choice: 'close' | 'cancel') => void;
      const confirmUnsavedClose = vi.fn(
        () => new Promise<'close' | 'cancel'>((resolve) => (answer = resolve))
      );
      const handler = createWindowCloseHandler({
        getBootstrap: () => null,
        getApplication: () => app,
        destroyWindow: async () => {},
        confirmUnsavedClose,
      });

      const requests = [handler(event()), handler(event()), handler(event())];
      await vi.advanceTimersByTimeAsync(0);
      answer('cancel');
      await Promise.all(requests);

      expect(confirmUnsavedClose).toHaveBeenCalledOnce();
      expect(app.checkUnsavedBeforeClose).toHaveBeenCalledOnce();
    });
  });
});

