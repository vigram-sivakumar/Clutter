import { describe, expect, it } from 'vitest';
import { VaultSyncCoordinator } from './VaultSyncCoordinator';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('VaultSyncCoordinator', () => {
  it('same key: operations execute strictly FIFO, never overlapping', async () => {
    const coordinator = new VaultSyncCoordinator();
    const order: string[] = [];
    const key = { type: 'page' as const, id: 'p1' };

    const a = coordinator.runExclusive(key, async () => {
      order.push('a-start');
      await delay(20);
      order.push('a-end');
    });

    const b = coordinator.runExclusive(key, async () => {
      order.push('b-start');
      await delay(5);
      order.push('b-end');
    });

    const c = coordinator.runExclusive(key, async () => {
      order.push('c-start');
      order.push('c-end');
    });

    await Promise.all([a, b, c]);

    expect(order).toEqual([
      'a-start',
      'a-end',
      'b-start',
      'b-end',
      'c-start',
      'c-end',
    ]);
  });

  it('different keys: operations run concurrently, not serialized against each other', async () => {
    const coordinator = new VaultSyncCoordinator();
    const order: string[] = [];

    const a = coordinator.runExclusive({ type: 'page', id: 'a' }, async () => {
      order.push('a-start');
      await delay(20);
      order.push('a-end');
    });

    const b = coordinator.runExclusive({ type: 'page', id: 'b' }, async () => {
      order.push('b-start');
      await delay(5);
      order.push('b-end');
    });

    await Promise.all([a, b]);

    // b's short operation completes before a's long one, proving they ran
    // concurrently rather than b waiting for a to finish first.
    expect(order.indexOf('b-end')).toBeLessThan(order.indexOf('a-end'));
    expect(order).toEqual(['a-start', 'b-start', 'b-end', 'a-end']);
  });

  it('a failed operation does not block later operations on the same key', async () => {
    const coordinator = new VaultSyncCoordinator();
    const key = { type: 'path' as const, path: '/vault/Note.md' };

    const failing = coordinator.runExclusive(key, async () => {
      throw new Error('boom');
    });

    await expect(failing).rejects.toThrow('boom');

    const succeeding = await coordinator.runExclusive(key, async () => 'recovered');

    expect(succeeding).toBe('recovered');
  });

  it('queue entries are cleaned up after completion', async () => {
    const coordinator = new VaultSyncCoordinator();
    const key = { type: 'page' as const, id: 'p1' };

    expect(coordinator.pendingKeyCount).toBe(0);

    const operation = coordinator.runExclusive(key, async () => 'done');
    expect(coordinator.pendingKeyCount).toBe(1);

    await operation;
    await flush();

    expect(coordinator.pendingKeyCount).toBe(0);
  });

  it('cleans up after a failed operation too, not just successful ones', async () => {
    const coordinator = new VaultSyncCoordinator();
    const key = { type: 'page' as const, id: 'p1' };

    await coordinator.runExclusive(key, async () => {
      throw new Error('boom');
    }).catch(() => undefined);
    await flush();

    expect(coordinator.pendingKeyCount).toBe(0);
  });

  it('a slow operation on page A does not block a fast operation on page B', async () => {
    const coordinator = new VaultSyncCoordinator();
    const completions: string[] = [];

    const slowA = coordinator
      .runExclusive({ type: 'page', id: 'A' }, async () => {
        await delay(50);
        return 'A';
      })
      .then((value) => completions.push(value));

    const fastB = coordinator
      .runExclusive({ type: 'page', id: 'B' }, async () => {
        await delay(5);
        return 'B';
      })
      .then((value) => completions.push(value));

    // B finishes well before A, even though A was submitted first.
    await fastB;
    expect(completions).toEqual(['B']);

    await slowA;
    expect(completions).toEqual(['B', 'A']);
  });

  it('normalizes keys so a page id and a path cannot collide', async () => {
    const coordinator = new VaultSyncCoordinator();
    const order: string[] = [];

    // Crafted so the raw path looks like it could alias the page key's
    // internal encoding if normalization weren't collision-safe.
    const pageKey = { type: 'page' as const, id: '123' };
    const pathKey = { type: 'path' as const, path: 'page:123' };

    const a = coordinator.runExclusive(pageKey, async () => {
      order.push('page-start');
      await delay(20);
      order.push('page-end');
    });

    const b = coordinator.runExclusive(pathKey, async () => {
      order.push('path-start');
      await delay(5);
      order.push('path-end');
    });

    await Promise.all([a, b]);

    // If these collided onto the same queue lane, path-start would only
    // appear after page-end. They don't, so they ran concurrently.
    expect(order).toEqual(['page-start', 'path-start', 'path-end', 'page-end']);
  });
});
