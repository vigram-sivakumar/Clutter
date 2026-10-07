// @vitest-environment jsdom

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

const items: PickerListItem[] = [
  { id: 'folder-1', title: 'Project', level: 0, parentId: null },
  { id: 'folder-2', title: 'Finance', level: 0, parentId: null },
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

  it('lists nested folders flat — no tree, no carets — each with its parent path under the name', () => {
    const nested: PickerListItem[] = [
      ...items,
      {
        id: 'folder-1a',
        title: 'Design',
        level: 1,
        parentId: 'folder-1',
        ancestors: [{ id: 'folder-1', title: 'Project' }],
      },
    ];
    render(<MoveDestinationPickerHarness items={nested} onSelect={vi.fn()} />);

    expect(screen.getByText('Design')).toBeDefined();
    expect(screen.getAllByText('Project')).toHaveLength(2); // its own row, and Design's path
    expect(document.querySelector('.picker-list__path')?.textContent).toBe('Project');
    expect(document.querySelectorAll('.picker-list__item')).toHaveLength(3);
    expect(document.querySelector('.folder-leading__caret, [aria-expanded]')).toBeNull();
  });

  it('is titled Move to, lists folders alphabetically, and has no section title, divider or Show more', () => {
    render(<Harness onSelect={vi.fn()} />);

    expect(document.querySelector('.picker-card__header')?.textContent).toBe('Move to');
    expect(
      Array.from(document.querySelectorAll('.picker-list__title')).map((el) => el.textContent)
    ).toEqual(['Finance', 'Project']);
    expect(document.querySelector('.menu__group-title')).toBeNull();
    expect(document.querySelector('[role="separator"]')).toBeNull();
    expect(document.querySelector('[id^="picker-list-toggle"]')).toBeNull();
  });

  it('caps the list at five with a Show more row that expands it, still with no section title', () => {
    const many: PickerListItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `f${i}`,
      title: `Folder ${i}`,
      level: 0,
      parentId: null,
    }));
    render(<MoveDestinationPickerHarness items={many} onSelect={vi.fn()} />);

    const titles = () =>
      Array.from(document.querySelectorAll('.picker-list__item'))
        .filter((el) => !el.id.startsWith('picker-list-toggle'))
        .map((el) => el.textContent);
    expect(titles()).toHaveLength(5);
    expect(screen.queryByText('Folder 5')).toBeNull();
    expect(document.querySelector('.menu__group-title')).toBeNull();

    fireEvent.click(screen.getByText('Show more'));
    expect(titles()).toHaveLength(8);
    expect(screen.getByText('Folder 7')).toBeDefined();

    fireEvent.click(screen.getByText('Show less'));
    expect(titles()).toHaveLength(5);
  });

  it('keeps the vault root first and reports it as null', () => {
    const onSelect = vi.fn();
    const withRoot: PickerListItem[] = [
      { id: '__vault-root__', title: 'Clutter', secondaryLabel: 'Home', level: 0, parentId: null },
      ...items,
    ];
    render(<MoveDestinationPickerHarness items={withRoot} onSelect={onSelect} />);

    expect(document.querySelector('.picker-list__item')?.textContent).toContain('Clutter');
    fireEvent.click(screen.getByText('Clutter'));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('the dismiss button closes the picker', () => {
    const onClose = vi.fn();
    function DismissHarness() {
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchorRef}>anchor</button>
          <MoveDestinationPicker anchorRef={anchorRef} open items={items} onSelect={vi.fn()} onClose={onClose} />
        </>
      );
    }
    render(<DismissHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onClose).toHaveBeenCalledTimes(1);
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
      onSelect: (id: string | null) => void;
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
      // PickerList's own Create row is a stable id, not one text node —
      // see PickerList.test.tsx's own getCreateRow() doc comment for why.
      fireEvent.click(document.getElementById('picker-list-create')!);

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
  items: PickerListItem[];
  onSelect: (id: string | null) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef}>anchor</button>
      <MoveDestinationPicker anchorRef={anchorRef} open items={items} onSelect={onSelect} onClose={() => {}} />
    </>
  );
}

// ADR-049: one picker renders whichever root the resource needs — nothing resource-specific here.
describe('MoveDestinationPicker — roots', () => {
  const templateItems: PickerListItem[] = [
    { id: 'zeta-sub', title: 'Alpha', level: 1, parentId: 'templates-root', ancestors: [{ id: 'templates-root', title: 'Templates' }] },
    { id: 'templates-root', title: 'Templates', isRoot: true, level: 0, parentId: null },
  ];

  it('pins a Templates/Assets root first (like the vault root), then the rest alphabetically', () => {
    const { container } = render(<MoveDestinationPickerHarness items={templateItems} onSelect={vi.fn()} />);

    const rows = Array.from(container.ownerDocument.querySelectorAll('.picker-list [role="option"], .picker-list .entry'));
    const titles = rows.map((row) => row.textContent ?? '');

    // "Templates" (the root) precedes "Alpha" although "Alpha" sorts first alphabetically.
    expect(titles.findIndex((text) => text.startsWith('Templates'))).toBeLessThan(
      titles.findIndex((text) => text.startsWith('Alpha'))
    );
  });

  it('selecting a Templates/Assets root selects that folder id — not null (only the vault root maps to null)', () => {
    const onSelect = vi.fn();
    render(<MoveDestinationPickerHarness items={templateItems} onSelect={onSelect} />);

    fireEvent.click(screen.getAllByText('Templates')[0]!);

    expect(onSelect).toHaveBeenCalledWith('templates-root');
  });

  it('selecting the vault root still maps to null', () => {
    const onSelect = vi.fn();
    const withVaultRoot: PickerListItem[] = [
      { id: '__vault-root__', title: 'vault', secondaryLabel: 'Home', isRoot: true, level: 0, parentId: null },
      { id: 'folder-1', title: 'Project', level: 0, parentId: null },
    ];
    render(<MoveDestinationPickerHarness items={withVaultRoot} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('vault'));

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
