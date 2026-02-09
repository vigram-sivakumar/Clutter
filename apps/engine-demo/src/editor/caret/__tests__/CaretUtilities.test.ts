/**
 * CaretUtilities.test.ts
 *
 * Tests for type-safe RAF utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleRAF, scheduleRAFSequence } from '../CaretUtilities';

describe('CaretUtilities - RAF Type Safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock RAF in test environment
    global.requestAnimationFrame = vi.fn((cb) => {
      return setTimeout(cb, 16) as unknown as number;
    });
    global.cancelAnimationFrame = vi.fn((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('scheduleRAF', () => {
    it('should execute callback on next frame', () => {
      const callback = vi.fn();
      scheduleRAF(callback);

      expect(callback).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should never pass timestamp to callback', () => {
      const callback = vi.fn();
      scheduleRAF(callback);

      vi.runAllTimers();

      // Callback should be called with zero arguments
      expect(callback).toHaveBeenCalledWith();
      expect(callback.mock.calls[0]).toHaveLength(0);
    });

    it('should allow cancellation before execution', () => {
      const callback = vi.fn();
      const token = scheduleRAF(callback);

      token.cancel();
      vi.runAllTimers();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not error if cancelled after execution', () => {
      const callback = vi.fn();
      const token = scheduleRAF(callback);

      vi.runAllTimers();
      expect(callback).toHaveBeenCalledTimes(1);

      // Should not throw
      expect(() => token.cancel()).not.toThrow();
    });

    it('should support multiple independent callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      scheduleRAF(callback1);
      scheduleRAF(callback2);

      vi.runAllTimers();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduleRAFSequence', () => {
    it('should execute callbacks in sequence across multiple frames', () => {
      const calls: number[] = [];
      const callbacks = [
        () => calls.push(1),
        () => calls.push(2),
        () => calls.push(3),
      ];

      scheduleRAFSequence(callbacks);

      expect(calls).toEqual([]);

      // First frame
      vi.advanceTimersByTime(16);
      expect(calls).toEqual([1]);

      // Second frame
      vi.advanceTimersByTime(16);
      expect(calls).toEqual([1, 2]);

      // Third frame
      vi.advanceTimersByTime(16);
      expect(calls).toEqual([1, 2, 3]);
    });

    it('should allow cancellation of remaining callbacks', () => {
      const calls: number[] = [];
      const callbacks = [
        () => calls.push(1),
        () => calls.push(2),
        () => calls.push(3),
      ];

      const token = scheduleRAFSequence(callbacks);

      // First frame executes
      vi.advanceTimersByTime(16);
      expect(calls).toEqual([1]);

      // Cancel remaining
      token.cancel();

      // Subsequent frames should not execute
      vi.advanceTimersByTime(100);
      expect(calls).toEqual([1]); // Still only 1
    });

    it('should handle empty array', () => {
      expect(() => {
        const token = scheduleRAFSequence([]);
        vi.runAllTimers();
        token.cancel();
      }).not.toThrow();
    });
  });
});
