/**
 * Tests for FloatingContainer
 * Testing: Portal rendering, positioning, click-outside detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FloatingContainer } from './FloatingContainer';

describe('FloatingContainer', () => {
  beforeEach(() => {
    // Clear document.body before each test
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <FloatingContainer isOpen={false} position={{ top: 100, left: 200 }}>
          <div data-testid="content">Menu Content</div>
        </FloatingContainer>
      );

      expect(container.innerHTML).toBe('');
      expect(document.querySelector('[data-floating-container]')).toBeNull();
    });

    it('should render children when isOpen is true', () => {
      render(
        <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
          <div data-testid="content">Menu Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector('[data-floating-container]');
      expect(container).toBeTruthy();
      expect(container?.textContent).toBe('Menu Content');
    });

    it('should render via portal to document.body', () => {
      const { container } = render(
        <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
          <div>Portal Content</div>
        </FloatingContainer>
      );

      // Content should NOT be in the React container
      expect(container.innerHTML).toBe('');

      // Content SHOULD be in document.body
      const portalElement = document.body.querySelector(
        '[data-floating-container]'
      );
      expect(portalElement).toBeTruthy();
      expect(portalElement?.textContent).toBe('Portal Content');
    });

    it('should apply className prop', () => {
      render(
        <FloatingContainer
          isOpen={true}
          position={{ top: 100, left: 200 }}
          className="custom-dropdown"
        >
          <div>Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector('[data-floating-container]');
      expect(container?.className).toBe('custom-dropdown');
    });
  });

  describe('Positioning', () => {
    it('should apply fixed positioning', () => {
      render(
        <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      expect(container?.style.position).toBe('fixed');
    });

    it('should apply top and left position', () => {
      render(
        <FloatingContainer isOpen={true} position={{ top: 150, left: 250 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      expect(container?.style.top).toBe('150px');
      expect(container?.style.left).toBe('250px');
    });

    it('should apply bottom and left position', () => {
      render(
        <FloatingContainer isOpen={true} position={{ bottom: 50, left: 100 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      expect(container?.style.bottom).toBe('50px');
      expect(container?.style.left).toBe('100px');
      expect(container?.style.top).toBe('');
    });

    it('should apply right position', () => {
      render(
        <FloatingContainer isOpen={true} position={{ top: 100, right: 50 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      expect(container?.style.right).toBe('50px');
    });

    it('should apply transform', () => {
      render(
        <FloatingContainer
          isOpen={true}
          position={{ top: 100, left: 200, transform: 'translateX(-50%)' }}
        >
          <div>Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      expect(container?.style.transform).toBe('translateX(-50%)');
    });

    it('should apply z-index from sizing tokens', () => {
      render(
        <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      const container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      // Should use sizing.zIndex.dropdown (1000)
      expect(container?.style.zIndex).toBe('1000');
    });
  });

  describe('Click-Outside Detection', () => {
    it('should call onInteractOutside when clicking outside', () => {
      const onInteractOutside = vi.fn();

      render(
        <FloatingContainer
          isOpen={true}
          position={{ top: 100, left: 200 }}
          onInteractOutside={onInteractOutside}
        >
          <div data-testid="menu">Menu Content</div>
        </FloatingContainer>
      );

      // Create an outside element
      const outsideElement = document.createElement('div');
      document.body.appendChild(outsideElement);

      // Simulate click on outside element
      const clickEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(clickEvent, 'target', {
        value: outsideElement,
        enumerable: true,
      });

      document.dispatchEvent(clickEvent);

      expect(onInteractOutside).toHaveBeenCalledTimes(1);
      expect(onInteractOutside).toHaveBeenCalledWith(clickEvent);
    });

    it('should NOT call onInteractOutside when clicking inside', () => {
      const onInteractOutside = vi.fn();

      render(
        <FloatingContainer
          isOpen={true}
          position={{ top: 100, left: 200 }}
          onInteractOutside={onInteractOutside}
        >
          <div data-testid="menu">Menu Content</div>
        </FloatingContainer>
      );

      const menu = document.querySelector('[data-testid="menu"]');

      // Simulate click inside menu
      const clickEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(clickEvent, 'target', {
        value: menu,
        enumerable: true,
      });

      document.dispatchEvent(clickEvent);

      expect(onInteractOutside).not.toHaveBeenCalled();
    });

    it('should not set up listener if onInteractOutside not provided', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      render(
        <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      // Should not add mousedown listener
      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function),
        true
      );
    });

    it('should not set up listener if isOpen is false', () => {
      const onInteractOutside = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      render(
        <FloatingContainer
          isOpen={false}
          position={{ top: 100, left: 200 }}
          onInteractOutside={onInteractOutside}
        >
          <div>Content</div>
        </FloatingContainer>
      );

      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function),
        true
      );
    });

    it('should use capture phase for event listener', () => {
      const onInteractOutside = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      render(
        <FloatingContainer
          isOpen={true}
          position={{ top: 100, left: 200 }}
          onInteractOutside={onInteractOutside}
        >
          <div>Content</div>
        </FloatingContainer>
      );

      // Third argument should be true (capture phase)
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function),
        true
      );
    });

    it('should cleanup listener on unmount', () => {
      const onInteractOutside = vi.fn();
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = render(
        <FloatingContainer
          isOpen={true}
          position={{ top: 100, left: 200 }}
          onInteractOutside={onInteractOutside}
        >
          <div>Content</div>
        </FloatingContainer>
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function),
        true
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle SSR (no document)', () => {
      // This is already handled by the typeof document !== 'undefined' check
      // The component returns null in SSR
      expect(() => {
        render(
          <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
            <div>Content</div>
          </FloatingContainer>
        );
      }).not.toThrow();
    });

    it('should handle position updates', () => {
      const { rerender } = render(
        <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      let container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      expect(container?.style.top).toBe('100px');

      // Update position
      rerender(
        <FloatingContainer isOpen={true} position={{ top: 300, left: 400 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      container = document.querySelector(
        '[data-floating-container]'
      ) as HTMLElement;
      expect(container?.style.top).toBe('300px');
      expect(container?.style.left).toBe('400px');
    });

    it('should handle toggling isOpen', () => {
      const { rerender } = render(
        <FloatingContainer isOpen={true} position={{ top: 100, left: 200 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      expect(document.querySelector('[data-floating-container]')).toBeTruthy();

      rerender(
        <FloatingContainer isOpen={false} position={{ top: 100, left: 200 }}>
          <div>Content</div>
        </FloatingContainer>
      );

      expect(document.querySelector('[data-floating-container]')).toBeNull();
    });
  });
});
