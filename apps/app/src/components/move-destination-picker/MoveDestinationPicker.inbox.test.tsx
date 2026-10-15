// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { MoveDestinationPicker } from './MoveDestinationPicker';
import type { PickerListItem } from '@components/picker-list/PickerList.types';

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

// As buildMoveDestinationItems returns them for a note: Inbox, Templates, then the folders.
const items: PickerListItem[] = [
  { id: 'inbox', title: 'Inbox', icon: 'tray', isRoot: true, level: 0, parentId: null },
  { id: 'templates', title: 'Templates', icon: 'template', isRoot: true, level: 0, parentId: null },
  { id: 'projects', title: 'Projects', level: 0, parentId: null },
  { id: 'finance', title: 'Finance', level: 0, parentId: null },
];

function Harness({ onSelect }: { onSelect: (id: string | null) => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef}>anchor</button>
      <MoveDestinationPicker anchorRef={anchorRef} open items={items} onSelect={onSelect} onClose={() => {}} />
    </>
  );
}

const rowTitles = () =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).map((row) => row.textContent ?? '');

describe('MoveDestinationPicker: Inbox', () => {
  it('lists Inbox above Templates, then a divider and the Folders', () => {
    render(<Harness onSelect={vi.fn()} />);

    expect(rowTitles().slice(0, 2)).toEqual(['Inbox', 'Templates']);
    expect(rowTitles().indexOf('Finance')).toBeGreaterThan(1);
    expect(screen.getByText('Folders')).toBeInTheDocument();
    // Inbox keeps its own icon, not the folder icon.
    const inbox = document.querySelector('[role="menuitem"]')!;
    expect(inbox.querySelector('.app-icon svg')).not.toBeNull();
  });

  it('selecting Inbox reports its folder id, the same destination any folder reports', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Inbox'));

    expect(onSelect).toHaveBeenCalledWith('inbox');
  });

  it('selecting Templates or an ordinary folder is unchanged', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Templates'));
    fireEvent.click(screen.getByText('Projects'));

    expect(onSelect).toHaveBeenNthCalledWith(1, 'templates');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'projects');
  });

  it('search finds Inbox by name and filters the rest', () => {
    render(<Harness onSelect={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search folders'), { target: { value: 'inb' } });

    expect(rowTitles()).toEqual(['Inbox']);
  });
});
