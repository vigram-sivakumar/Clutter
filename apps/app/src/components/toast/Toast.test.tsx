// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders nothing without a toast', () => {
    const { container } = render(<Toast toast={null} onDismiss={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the message and dismisses after the duration', () => {
    const onDismiss = vi.fn();
    render(<Toast toast={{ id: 1, text: 'Saved to vault', tone: 'default' }} onDismiss={onDismiss} durationMs={1000} />);
    expect(screen.getByRole('status').textContent).toBe('Saved to vault');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers an optional action; pressing it runs it and dismisses the toast', () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <Toast
        toast={{ id: 1, text: 'Restored to Inbox', tone: 'default', action: { label: 'Open', onAction } }}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders no button without an action', () => {
    render(<Toast toast={{ id: 1, text: 'Saved to vault', tone: 'default' }} onDismiss={() => {}} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('announces an error as an alert and anything else as a status', () => {
    const { rerender } = render(<Toast toast={{ id: 1, text: 'Couldn’t save', tone: 'error' }} onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t save');
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<Toast toast={{ id: 2, text: 'Link copied', tone: 'default' }} onDismiss={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('Link copied');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays longer for an error or an offered action than for a plain confirmation', () => {
    const plain = vi.fn();
    const error = vi.fn();
    const actionable = vi.fn();
    render(<Toast toast={{ id: 1, text: 'Plain', tone: 'default' }} onDismiss={plain} />);
    render(<Toast toast={{ id: 2, text: 'Error', tone: 'error' }} onDismiss={error} />);
    render(
      <Toast
        toast={{ id: 3, text: 'Action', tone: 'default', action: { label: 'Undo', onAction: () => {} } }}
        onDismiss={actionable}
      />
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(plain).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(actionable).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(actionable).toHaveBeenCalledTimes(1);
  });

  it('waits while the pointer is over it, then runs its full duration again', () => {
    const onDismiss = vi.fn();
    render(<Toast toast={{ id: 1, text: 'Saved', tone: 'default' }} onDismiss={onDismiss} durationMs={1000} />);
    const toast = screen.getByRole('status');

    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('waits while its action has keyboard focus', () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ id: 1, text: 'Note archived', tone: 'default', action: { label: 'Undo', onAction: () => {} } }}
        onDismiss={onDismiss}
        durationMs={1000}
      />
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByRole('button', { name: 'Undo' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe('animation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('keeps the toast in the DOM through its exit animation, then removes it', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ animationName: 'toast-exit' } as CSSStyleDeclaration);
      const first = { id: 1, text: 'Saved', tone: 'default' as const };
      const { rerender } = render(<Toast toast={first} onDismiss={() => {}} />);

      rerender(<Toast toast={null} onDismiss={() => {}} />);

      const leaving = screen.getByText('Saved').closest('.toast') as HTMLElement;
      expect(leaving.classList.contains('toast--leaving')).toBe(true);
      expect(leaving.getAttribute('aria-hidden')).toBe('true');

      fireEvent.animationEnd(leaving);
      expect(screen.queryByText('Saved')).toBeNull();
    });

    it('still removes the toast if the animation end never fires', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ animationName: 'toast-exit' } as CSSStyleDeclaration);
      const { rerender } = render(<Toast toast={{ id: 1, text: 'Saved', tone: 'default' }} onDismiss={() => {}} />);

      rerender(<Toast toast={null} onDismiss={() => {}} />);
      expect(screen.getByText('Saved')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByText('Saved')).toBeNull();
    });

    it('removes the toast at once when nothing animates (reduced motion)', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ animationName: 'none' } as CSSStyleDeclaration);
      const { rerender } = render(<Toast toast={{ id: 1, text: 'Saved', tone: 'default' }} onDismiss={() => {}} />);

      rerender(<Toast toast={null} onDismiss={() => {}} />);

      expect(screen.queryByText('Saved')).toBeNull();
    });

    it('swaps a replacing toast in place: no exit, no second element', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ animationName: 'toast-exit' } as CSSStyleDeclaration);
      const { rerender } = render(<Toast toast={{ id: 1, text: 'First', tone: 'default' }} onDismiss={() => {}} />);
      const element = screen.getByText('First').closest('.toast');

      rerender(<Toast toast={{ id: 2, text: 'Second', tone: 'default' }} onDismiss={() => {}} />);

      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByText('Second').closest('.toast')).toBe(element);
      expect(element?.classList.contains('toast--leaving')).toBe(false);
    });

    it('keeps its action usable on the way in, and leaves a dismissed one unclickable via CSS only', () => {
      const onAction = vi.fn();
      render(
        <Toast
          toast={{ id: 1, text: 'Note archived', tone: 'default', action: { label: 'Undo', onAction } }}
          onDismiss={() => {}}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });
});
