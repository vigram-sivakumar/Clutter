// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
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
});
