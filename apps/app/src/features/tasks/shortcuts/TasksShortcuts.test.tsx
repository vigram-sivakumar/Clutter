// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TasksShortcuts } from './TasksShortcuts';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

// Overlay's anchored positioning (useOverlayPosition) observes the anchor/
// surface elements via ResizeObserver, which jsdom doesn't implement — same
// stub PageHeaderMoreActionsMenu.test.tsx uses for the same reason.
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

afterEach(() => {
  cleanup();
});

describe('TasksShortcuts', () => {
  it('opens a task-creation overlay on "New" click without invoking onShortcut', () => {
    const onShortcut = vi.fn();
    render(<TasksShortcuts onShortcut={onShortcut} />);

    // Clicking opens the overlay at all only if Entry's disabled guard lets
    // the click through — a stronger signal than asserting the attribute
    // directly, and the one the earlier (now removed) "renders disabled"
    // test cared about in practice.
    fireEvent.click(screen.getByText('New'));

    expect(onShortcut).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('focuses the title field on open, and Escape does not dismiss it', () => {
    render(<TasksShortcuts onShortcut={vi.fn()} />);

    fireEvent.click(screen.getByText('New'));

    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();

    // dismissible={false} on the Dialog — auto-dismiss is off; only the
    // explicit close button (below) may close it.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('dismisses the overlay via the close button', () => {
    render(<TasksShortcuts onShortcut={vi.fn()} />);

    fireEvent.click(screen.getByText('New'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close'));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('a backdrop click does not dismiss the overlay', () => {
    render(<TasksShortcuts onShortcut={vi.fn()} />);

    fireEvent.click(screen.getByText('New'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    const backdrop = document.querySelector('.overlay__backdrop');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it.each([
    ['tasks-all', 'all-tasks'],
    ['tasks-unscheduled', 'unscheduled'],
    ['tasks-completed', 'completed'],
  ] as const)('invokes onShortcut with "%s" when clicked', (locationId, id) => {
    const onShortcut = vi.fn();
    render(<TasksShortcuts onShortcut={onShortcut} />);

    const title = getSystemLocationPresentation(locationId).label;
    fireEvent.click(screen.getByText(title));

    expect(onShortcut).toHaveBeenCalledWith(id);
  });
});
