/**
 * Tests for scrollLock utility
 * Testing: Reference-counted scroll locking for overlays
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  acquireScrollLock,
  releaseScrollLock,
  getScrollLockCount,
  resetScrollLock,
} from './scrollLock';

describe('scrollLock', () => {
  // Mock DOM elements
  let scrollWrapper: HTMLElement;
  let body: HTMLElement;

  beforeEach(() => {
    // Reset scroll lock state before each test
    resetScrollLock();

    // Create mock scroll-wrapper
    scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'scroll-wrapper';
    scrollWrapper.style.overflow = 'auto';
    scrollWrapper.scrollTop = 100;
    document.body.appendChild(scrollWrapper);

    // Reset body styles
    body = document.body;
    body.style.overflow = '';
    body.style.position = '';
    body.style.top = '';
    body.style.width = '';
  });

  afterEach(() => {
    // Cleanup
    if (scrollWrapper && scrollWrapper.parentNode === document.body) {
      document.body.removeChild(scrollWrapper);
    }
    resetScrollLock();
  });

  describe('Reference Counting', () => {
    it('should start with count of 0', () => {
      expect(getScrollLockCount()).toBe(0);
    });

    it('should increment count when acquiring lock', () => {
      acquireScrollLock();
      expect(getScrollLockCount()).toBe(1);

      acquireScrollLock();
      expect(getScrollLockCount()).toBe(2);
    });

    it('should decrement count when releasing lock', () => {
      acquireScrollLock();
      acquireScrollLock();
      expect(getScrollLockCount()).toBe(2);

      releaseScrollLock();
      expect(getScrollLockCount()).toBe(1);

      releaseScrollLock();
      expect(getScrollLockCount()).toBe(0);
    });

    it('should not go below 0', () => {
      releaseScrollLock();
      releaseScrollLock();
      expect(getScrollLockCount()).toBe(0);
    });
  });

  describe('Scroll Locking with .scroll-wrapper', () => {
    it('should lock scroll on first acquire', () => {
      acquireScrollLock();

      expect(scrollWrapper.style.overflow).toBe('hidden');
    });

    it('should preserve scroll position', () => {
      scrollWrapper.scrollTop = 250;

      acquireScrollLock();

      // Scroll position should be saved
      expect(scrollWrapper.scrollTop).toBe(250);
    });

    it('should not lock again if already locked (count > 1)', () => {
      acquireScrollLock();
      const firstOverflow = scrollWrapper.style.overflow;

      acquireScrollLock();
      const secondOverflow = scrollWrapper.style.overflow;

      expect(firstOverflow).toBe(secondOverflow);
      expect(getScrollLockCount()).toBe(2);
    });

    it('should restore scroll when count reaches 0', () => {
      const originalOverflow = scrollWrapper.style.overflow;
      const originalScrollTop = scrollWrapper.scrollTop;

      acquireScrollLock();
      expect(scrollWrapper.style.overflow).toBe('hidden');

      releaseScrollLock();

      expect(scrollWrapper.style.overflow).toBe(originalOverflow);
      expect(scrollWrapper.scrollTop).toBe(originalScrollTop);
    });

    it('should not restore scroll while count > 0', () => {
      acquireScrollLock();
      acquireScrollLock();

      releaseScrollLock();

      // Still locked because count is 1
      expect(scrollWrapper.style.overflow).toBe('hidden');
      expect(getScrollLockCount()).toBe(1);
    });
  });

  describe('Fallback to document.body', () => {
    let originalScrollY: PropertyDescriptor | undefined;

    beforeEach(() => {
      // Save original scrollY descriptor
      originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');

      // Remove scroll-wrapper to test fallback
      if (scrollWrapper && scrollWrapper.parentNode === document.body) {
        document.body.removeChild(scrollWrapper);
      }

      // Mock scrollY
      Object.defineProperty(window, 'scrollY', {
        writable: true,
        configurable: true,
        value: 150,
      });
    });

    afterEach(() => {
      // Restore original scrollY
      if (originalScrollY) {
        Object.defineProperty(window, 'scrollY', originalScrollY);
      }
    });

    it('should lock body when scroll-wrapper not found', () => {
      acquireScrollLock();

      expect(body.style.overflow).toBe('hidden');
      expect(body.style.position).toBe('fixed');
      expect(body.style.width).toBe('100%');
    });

    it('should save scroll position in body top style', () => {
      Object.defineProperty(window, 'scrollY', {
        writable: true,
        configurable: true,
        value: 200,
      });

      acquireScrollLock();

      expect(body.style.top).toBe('-200px');
    });

    it('should restore body scroll on release', () => {
      Object.defineProperty(window, 'scrollY', {
        writable: true,
        configurable: true,
        value: 300,
      });

      const scrollToSpy = vi
        .spyOn(window, 'scrollTo')
        .mockImplementation(() => {});

      acquireScrollLock();
      releaseScrollLock();

      expect(body.style.overflow).toBe('');
      expect(body.style.position).toBe('');
      expect(scrollToSpy).toHaveBeenCalledWith(0, 300);

      scrollToSpy.mockRestore();
    });
  });

  describe('Multiple Overlays', () => {
    it('should handle multiple overlays correctly', () => {
      // Menu 1 opens
      acquireScrollLock();
      expect(getScrollLockCount()).toBe(1);
      expect(scrollWrapper.style.overflow).toBe('hidden');

      // Menu 2 opens (while Menu 1 is open)
      acquireScrollLock();
      expect(getScrollLockCount()).toBe(2);
      expect(scrollWrapper.style.overflow).toBe('hidden');

      // Menu 2 closes
      releaseScrollLock();
      expect(getScrollLockCount()).toBe(1);
      expect(scrollWrapper.style.overflow).toBe('hidden'); // Still locked

      // Menu 1 closes
      releaseScrollLock();
      expect(getScrollLockCount()).toBe(0);
      expect(scrollWrapper.style.overflow).not.toBe('hidden'); // Unlocked
    });
  });

  describe('resetScrollLock', () => {
    it('should reset count to 0', () => {
      acquireScrollLock();
      acquireScrollLock();
      expect(getScrollLockCount()).toBe(2);

      resetScrollLock();

      expect(getScrollLockCount()).toBe(0);
    });

    it('should restore scroll state', () => {
      acquireScrollLock();
      expect(scrollWrapper.style.overflow).toBe('hidden');

      resetScrollLock();

      // Should restore (cleanup called)
      expect(scrollWrapper.style.overflow).not.toBe('hidden');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid acquire/release cycles', () => {
      for (let i = 0; i < 10; i++) {
        acquireScrollLock();
      }
      expect(getScrollLockCount()).toBe(10);

      for (let i = 0; i < 10; i++) {
        releaseScrollLock();
      }
      expect(getScrollLockCount()).toBe(0);
    });

    it('should handle release without acquire gracefully', () => {
      expect(() => releaseScrollLock()).not.toThrow();
      expect(getScrollLockCount()).toBe(0);
    });

    it('should handle missing DOM elements gracefully', () => {
      // Remove scroll-wrapper (already removed in fallback tests)
      if (scrollWrapper && scrollWrapper.parentNode === document.body) {
        document.body.removeChild(scrollWrapper);
      }

      // Should not throw even without scroll-wrapper
      expect(() => {
        acquireScrollLock();
        releaseScrollLock();
      }).not.toThrow();
    });
  });
});
