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

  it('says plainly that the changes were not saved and will be lost, and offers a way back', () => {
    render(<UnsavedCloseDialog unsavedCount={1} onAnswer={vi.fn()} />);

    expect(screen.getByText('Close without saving?')).toBeInTheDocument();
    expect(screen.getByText(/One note has changes that haven’t been saved/)).toBeInTheDocument();
    expect(screen.getByText(/they’ll be lost/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close and lose changes' })).toBeInTheDocument();
  });

  it('answers cancel for the safe button and close only for the destructive one', () => {
    const onAnswer = vi.fn();
    render(<UnsavedCloseDialog unsavedCount={3} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onAnswer).toHaveBeenLastCalledWith('cancel');

    fireEvent.click(screen.getByRole('button', { name: 'Close and lose changes' }));
    expect(onAnswer).toHaveBeenLastCalledWith('close');
  });

  it('when leaving a Space with a recovery copy kept, does not say the changes are lost', () => {
    render(<UnsavedCloseDialog unsavedCount={1} action="switch" recoveryKept onAnswer={vi.fn()} />);

    expect(screen.getByText('Switch spaces?')).toBeInTheDocument();
    expect(screen.getByText(/haven’t been saved to this space/)).toBeInTheDocument();
    expect(screen.getByText(/keeps a recovery copy of it/)).toBeInTheDocument();
    expect(screen.queryByText(/lost/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Switch anyway' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
  });

  it('counts notes', () => {
    expect(unsavedCloseCopy(3).description).toContain('3 notes have changes');
  });
});
