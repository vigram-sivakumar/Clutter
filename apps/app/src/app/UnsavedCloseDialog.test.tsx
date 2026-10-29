// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { UnsavedCloseDialog } from './UnsavedCloseDialog';
import { unsavedCloseCopy } from './unsavedCloseCopy';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(cleanup);

describe('UnsavedCloseDialog', () => {
  it('renders nothing while no close is waiting', () => {
    render(<UnsavedCloseDialog unsavedCount={null} onAnswer={vi.fn()} />);

    expect(screen.queryByText('Close without saving?')).toBeNull();
  });

  it('says how many notes have unsaved changes, and offers a way back', () => {
    render(<UnsavedCloseDialog unsavedCount={1} onAnswer={vi.fn()} />);

    expect(screen.getByText('Close without saving?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have unsaved changes that won’t be saved to your vault. A recovery copy may be available when Clutter opens again, but it might not include your latest edits'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close anyway' })).toBeInTheDocument();
  });

  it('answers cancel for the safe button and close only for the destructive one', () => {
    const onAnswer = vi.fn();
    render(<UnsavedCloseDialog unsavedCount={3} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onAnswer).toHaveBeenLastCalledWith('cancel');

    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    expect(onAnswer).toHaveBeenLastCalledWith('close');
  });

  it('leaving a Space says the same thing every time', () => {
    const { rerender } = render(<UnsavedCloseDialog unsavedCount={2} action="switch" onAnswer={vi.fn()} />);
    expect(screen.getByText('Switch spaces?')).toBeInTheDocument();
    expect(screen.getByText('You have 2 notes with unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch anyway' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();

    rerender(<UnsavedCloseDialog unsavedCount={2} action="switch" onAnswer={vi.fn()} />);
    expect(screen.getByText('Switch spaces?')).toBeInTheDocument();
    expect(screen.getByText('You have 2 notes with unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch anyway' })).toBeInTheDocument();
  });

  it('counts notes', () => {
    expect(unsavedCloseCopy(3, 'switch').description).toBe('You have 3 notes with unsaved changes');
    expect(unsavedCloseCopy(3).description).toBe(
      'You have 3 notes with unsaved changes that won’t be saved to your vault. Recovery copies may be available when Clutter opens again, but they might not include your latest edits'
    );
  });

  it('closing never promises recovery, never says the copy is already saved, and never says the changes are lost', () => {
    for (const count of [1, 4]) {
      const { description } = unsavedCloseCopy(count);
      expect(description).toMatch(/may be available/);
      expect(description).toMatch(/might not include your latest edits/);
      expect(description).toMatch(/won’t be saved to your vault/);
      expect(description).not.toMatch(/will be (recovered|restored)|are saved|is saved|lost|guarantee/i);
    }
  });
});
