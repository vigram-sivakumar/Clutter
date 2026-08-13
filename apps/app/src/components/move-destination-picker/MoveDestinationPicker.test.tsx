// @vitest-environment jsdom

import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { MoveDestinationPicker } from './MoveDestinationPicker';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';

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

const items: FolderPickerItem[] = [
  { id: 'folder-1', title: 'Project', level: 0, parentId: null },
  { id: 'folder-2', title: 'Finance', level: 0, parentId: null },
];

function Harness({ onSelect }: { onSelect: (id: string) => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef}>anchor</button>
      <MoveDestinationPicker anchorRef={anchorRef} open items={items} onSelect={onSelect} onClose={() => {}} />
    </>
  );
}

describe('MoveDestinationPicker', () => {
  it('renders only actual folder items — no root row, no root footer, no divider', () => {
    render(<Harness onSelect={vi.fn()} />);

    expect(screen.getByText('Project')).toBeDefined();
    expect(screen.getByText('Finance')).toBeDefined();
    expect(screen.queryByText('Vault root')).toBeNull();
    expect(screen.queryByText('Move to vault root')).toBeNull();
    expect(screen.queryByText('Root')).toBeNull();
    expect(document.querySelector('.move-destination-picker__divider')).toBeNull();
    expect(document.querySelector('.move-destination-picker__root-action')).toBeNull();
  });

  it('starts with folders collapsed (delegated to FolderPicker)', () => {
    const nested: FolderPickerItem[] = [
      ...items,
      { id: 'folder-1a', title: 'Design', level: 1, parentId: 'folder-1' },
    ];
    render(
      <MoveDestinationPickerHarness items={nested} onSelect={vi.fn()} />
    );

    expect(screen.queryByText('Design')).toBeNull();
  });

  it('selecting a folder calls onSelect with its real id', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Finance'));

    expect(onSelect).toHaveBeenCalledWith('folder-2');
  });

  it('focuses the search input as soon as it opens', () => {
    render(<Harness onSelect={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search folders'));
  });

  it('Escape closes the picker (Overlay\'s existing useEscape, not a second implementation)', () => {
    const onClose = vi.fn();
    function EscapeHarness() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchorRef}>anchor</button>
          <MoveDestinationPicker anchorRef={anchorRef} open items={items} onSelect={vi.fn()} onClose={onClose} />
        </>
      );
    }
    render(<EscapeHarness />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('Create folder (onCreateFolder)', () => {
    function CreateHarness({
      onSelect,
      onCreateFolder,
    }: {
      onSelect: (id: string) => void;
      onCreateFolder: (name: string) => Promise<string>;
    }) {
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchorRef}>anchor</button>
          <MoveDestinationPicker
            anchorRef={anchorRef}
            open
            items={items}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onClose={() => {}}
          />
        </>
      );
    }

    it('selecting Create calls the supplied creation flow, then routes the new id through the normal onSelect', async () => {
      const onSelect = vi.fn();
      const onCreateFolder = vi.fn(async (name: string) => {
        expect(name).toBe('Marketing');
        return 'folder-new';
      });
      render(<CreateHarness onSelect={onSelect} onCreateFolder={onCreateFolder} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Marketing' },
      });
      fireEvent.click(screen.getByText('Create "Marketing"'));

      await vi.waitFor(() => {
        expect(onSelect).toHaveBeenCalledWith('folder-new');
      });
      expect(onCreateFolder).toHaveBeenCalledWith('Marketing');
    });

    it('omits the Create row when no onCreateFolder is supplied, without reintroducing any root UI', () => {
      render(<Harness onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Marketing' },
      });

      expect(screen.queryByText('Create "Marketing"')).toBeNull();
      expect(screen.queryByText('Vault root')).toBeNull();
      expect(screen.queryByText('Move to vault root')).toBeNull();
      expect(document.querySelector('.move-destination-picker__root-action')).toBeNull();
    });
  });
});

function MoveDestinationPickerHarness({
  items,
  onSelect,
}: {
  items: FolderPickerItem[];
  onSelect: (id: string) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef}>anchor</button>
      <MoveDestinationPicker anchorRef={anchorRef} open items={items} onSelect={onSelect} onClose={() => {}} />
    </>
  );
}
