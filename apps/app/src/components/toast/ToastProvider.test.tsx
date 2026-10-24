// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastApi } from './ToastProvider';

let api: ToastApi;

function Capture() {
  api = useToast();
  return null;
}

function mount() {
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows one toast at a time; an equal-priority toast replaces the current one', () => {
    mount();
    act(() => void api.show({ text: 'First' }));
    act(() => void api.show({ text: 'Second' }));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Second');
  });

  it('does not let a routine toast replace an error', () => {
    mount();
    act(() => void api.fail('Couldn’t archive this note'));

    let shown: number | null = 0;
    act(() => {
      shown = api.show({ text: 'Link copied' });
    });

    expect(shown).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t archive this note');
    expect(screen.queryByText('Link copied')).toBeNull();
  });

  it('does not let a routine toast replace an actionable toast', () => {
    mount();
    act(() => void api.show({ text: 'Note archived', action: { label: 'Undo', onAction: () => {} } }));
    act(() => void api.show({ text: 'Link copied' }));

    expect(screen.getByRole('status').textContent).toContain('Note archived');
    expect(screen.queryByText('Link copied')).toBeNull();
  });

  it('lets an error replace an actionable toast, and an actionable toast replace a routine one', () => {
    mount();
    act(() => void api.show({ text: 'Link copied' }));
    act(() => void api.show({ text: 'Note archived', action: { label: 'Undo', onAction: () => {} } }));
    expect(screen.getByRole('status').textContent).toContain('Note archived');

    act(() => void api.fail('Couldn’t restore this note'));
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t restore this note');
  });

  it('accepts a routine toast again once the protecting toast has gone', () => {
    mount();
    act(() => void api.fail('Couldn’t save the image'));
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => void api.show({ text: 'Link copied' }));
    expect(screen.getByRole('status').textContent).toBe('Link copied');
  });

  it('dismisses by handle, and ignores the handle of a toast that was replaced', () => {
    mount();
    let first: number | null = null;
    act(() => {
      first = api.show({ text: 'First' });
    });
    act(() => void api.show({ text: 'Second' }));

    act(() => api.dismiss(first as unknown as number));
    expect(screen.getByRole('status').textContent).toBe('Second');

    let second: number | null = null;
    act(() => {
      second = api.show({ text: 'Third' });
    });
    act(() => api.dismiss(second as unknown as number));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('fail logs the diagnostics and shows an error toast', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    const error = new Error('disk full');

    act(() => void api.fail('Couldn’t delete this note', error));

    expect(log).toHaveBeenCalledWith('Couldn’t delete this note', error);
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t delete this note');
  });

  it('runs an action and dismisses the toast', () => {
    mount();
    const onAction = vi.fn();
    act(() => void api.show({ text: 'Note archived', action: { label: 'Undo', onAction } }));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows nothing and does not throw outside a provider', () => {
    let outside: ToastApi | undefined;
    function Outside() {
      outside = useToast();
      return null;
    }
    render(<Outside />);

    expect(outside?.show({ text: 'Hello' })).toBeNull();
    expect(() => outside?.dismiss(1)).not.toThrow();
  });
});
