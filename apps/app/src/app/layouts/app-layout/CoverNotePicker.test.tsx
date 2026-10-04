// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CoverNotePicker } from './CoverNotePicker';

const notes = [
  { id: 'a', title: 'Project Overview', level: 0, parentId: null },
  { id: 'b', title: 'Meeting Notes', level: 0, parentId: null },
];

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CoverNotePicker', () => {
  it('offers notes with a notes search, and reports the chosen note', () => {
    const onSelect = vi.fn();
    render(<CoverNotePicker open notes={notes} onSelect={onSelect} onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText('Search notes and folders…')).toBeTruthy();
    fireEvent.click(screen.getByText('Meeting Notes'));

    expect(onSelect).toHaveBeenCalledWith({ kind: 'note', id: 'b' });
  });

  it('the dismiss button closes without choosing, and there is no Cancel', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<CoverNotePicker open notes={notes} onSelect={onSelect} onClose={onClose} />);

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers a Folders section after the notes, and reports a chosen folder as a folder', () => {
    const onSelect = vi.fn();
    const folders = [{ id: 'f1', title: 'Projects', level: 0, parentId: null, section: 'Folders' }];
    render(<CoverNotePicker open notes={notes} folders={folders} onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Projects'));

    expect(onSelect).toHaveBeenCalledWith({ kind: 'folder', id: 'f1' });
  });
});
