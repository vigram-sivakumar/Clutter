import { describe, expect, it } from 'vitest';
import { SelfWriteRegistry } from './SelfWriteRegistry';

describe('SelfWriteRegistry', () => {
  it('consumes a pending write exactly once', () => {
    const registry = new SelfWriteRegistry();

    registry.markPending('Note.md');

    expect(registry.consumePending('Note.md')).toBe(true);
    expect(registry.consumePending('Note.md')).toBe(false);
  });

  it('returns false for a path that was never marked', () => {
    const registry = new SelfWriteRegistry();

    expect(registry.consumePending('Untouched.md')).toBe(false);
  });

  it('tracks overlapping pending writes to the same path independently', () => {
    const registry = new SelfWriteRegistry();

    registry.markPending('Note.md');
    registry.markPending('Note.md');

    expect(registry.consumePending('Note.md')).toBe(true);
    // A second echo for the same path is still expected — the count was 2.
    expect(registry.consumePending('Note.md')).toBe(true);
    // Nothing left to consume.
    expect(registry.consumePending('Note.md')).toBe(false);
  });

  it('tracks paths independently of one another', () => {
    const registry = new SelfWriteRegistry();

    registry.markPending('A.md');

    expect(registry.consumePending('B.md')).toBe(false);
    expect(registry.consumePending('A.md')).toBe(true);
  });

  describe('move pair tracking', () => {
    it('consumes a pending move exactly once', () => {
      const registry = new SelfWriteRegistry();

      registry.markPendingMove('A.md', 'B.md');

      expect(registry.consumePendingMove('A.md', 'B.md')).toBe(true);
      expect(registry.consumePendingMove('A.md', 'B.md')).toBe(false);
    });

    it('tracks independent move pairs separately', () => {
      const registry = new SelfWriteRegistry();

      registry.markPendingMove('A.md', 'B.md');
      registry.markPendingMove('C.md', 'D.md');

      expect(registry.consumePendingMove('A.md', 'B.md')).toBe(true);
      expect(registry.consumePendingMove('C.md', 'D.md')).toBe(true);
    });

    it('tracks overlapping pending moves to the same pair independently', () => {
      const registry = new SelfWriteRegistry();

      registry.markPendingMove('A.md', 'B.md');
      registry.markPendingMove('A.md', 'B.md');

      expect(registry.consumePendingMove('A.md', 'B.md')).toBe(true);
      expect(registry.consumePendingMove('A.md', 'B.md')).toBe(true);
      expect(registry.consumePendingMove('A.md', 'B.md')).toBe(false);
    });

    it('does not match destination-only when the source path differs', () => {
      const registry = new SelfWriteRegistry();

      registry.markPendingMove('Projects/A.md', 'Archive/A.md');

      expect(registry.consumePendingMove('Inbox/B.md', 'Archive/A.md')).toBe(false);
    });
  });
});
