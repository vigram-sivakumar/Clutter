// @vitest-environment jsdom

// No global jest-dom setup exists in this project's vitest config yet —
// imported locally, same as FolderTree.test.tsx/ResourceTopBarActions.test.tsx.
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderTopBarActions } from './topBarRegistry';

// Overlay's positioning logic observes anchor/surface size via
// ResizeObserver, which jsdom doesn't implement — stubbed the same way
// ResourceTopBarActions' own test suite already does.
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

function openOverflowMenu() {
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[buttons.length - 1]!);
}

describe('topBarRegistry — folder resource type (ADR-024)', () => {
  it("wires onDelete to the folder menu's Delete item", () => {
    const onDelete = vi.fn();

    render(<>{renderTopBarActions('folder', { onDelete })}</>);
    openOverflowMenu();

    fireEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders Delete even when onDelete is not supplied — it stays present, just inert (matching every other unwired menu item)', () => {
    render(<>{renderTopBarActions('folder')}</>);
    openOverflowMenu();

    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it("a reserved folder renders ReservedFolderTopBarActions instead, with no Delete option", () => {
    render(<>{renderTopBarActions('reserved-folder')}</>);

    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});
