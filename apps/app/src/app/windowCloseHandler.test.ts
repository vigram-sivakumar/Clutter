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
});
