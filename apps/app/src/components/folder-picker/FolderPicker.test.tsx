// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderPicker } from './FolderPicker';
import type { FolderPickerItem } from './FolderPicker.types';

afterEach(() => {
  cleanup();
});

const items: FolderPickerItem[] = [
  { id: 'folder-project', title: 'Project', level: 0, parentId: null, emoji: '📁' },
  { id: 'folder-finance', title: 'Finance', level: 0, parentId: null, emoji: '💰' },
  {
    id: 'folder-design',
    title: 'Design',
    level: 1,
    parentId: 'folder-project',
    ancestors: [{ id: 'folder-project', title: 'Project' }],
  },
  {
    id: 'folder-research',
    title: 'Research',
    level: 1,
    parentId: 'folder-project',
    ancestors: [{ id: 'folder-project', title: 'Project' }],
  },
];

describe('FolderPicker', () => {
  it('never renders a row for the vault root — items alone define what shows', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    expect(screen.queryByText('Root')).toBeNull();
    expect(screen.queryByText('Vault root')).toBeNull();
  });

  it('starts with every nested folder collapsed — only top-level items are visible', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    expect(screen.getByText('Project')).toBeDefined();
    expect(screen.getByText('Finance')).toBeDefined();
    expect(screen.queryByText('Design')).toBeNull();
    expect(screen.queryByText('Research')).toBeNull();
  });

  it('expanding a top-level folder reveals its children, without affecting siblings', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    const caret = document.querySelector('.folder__caret .caret-slot');
    if (!caret) {
      throw new Error('expected an expand caret for Project');
    }
    fireEvent.click(caret);

    expect(screen.getByText('Design')).toBeDefined();
    expect(screen.getByText('Research')).toBeDefined();
  });

  it('a folder with children shows a caret', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    const projectRow = screen.getByText('Project').closest('.entry');
    expect(projectRow?.querySelector('.caret-slot')).not.toBeNull();
  });

  it('a folder with no children shows no caret at all', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    const financeRow = screen.getByText('Finance').closest('.entry');
    expect(financeRow?.querySelector('.caret-slot')).toBeNull();
  });

  it('renders the folder icon via FolderLeading in the normal tree', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    const projectRow = screen.getByText('Project').closest('.entry');
    expect(projectRow?.querySelector('.folder__icon .emoji-icon')?.textContent).toBe('📁');
  });

  it('clicking a row calls onSelect with that item, not its expand toggle', () => {
    const onSelect = vi.fn();
    render(<FolderPicker items={items} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Finance'));

    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('expanding does not invoke onSelect', () => {
    const onSelect = vi.fn();
    render(<FolderPicker items={items} onSelect={onSelect} />);

    const caret = document.querySelector('.folder__caret .caret-slot');
    if (!caret) {
      throw new Error('expected an expand caret for Project');
    }
    fireEvent.click(caret);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('searching shows every matching item flat, regardless of collapsed state', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search folders'), {
      target: { value: 'Design' },
    });

    const row = document.querySelector('[role="menuitem"]');
    expect(row?.textContent).toContain('Project');
    expect(row?.textContent).toContain('Design');
  });

  describe('nested search results (plain-text path, no breadcrumb icons)', () => {
    const nestedItems: FolderPickerItem[] = [
      { id: 'folder-project', title: 'Project', level: 0, parentId: null, emoji: '📁' },
      {
        id: 'folder-finance',
        title: 'Finance',
        level: 1,
        parentId: 'folder-project',
        ancestors: [{ id: 'folder-project', title: 'Project' }],
        emoji: '💰',
      },
      {
        id: 'folder-bank-statement',
        title: 'Bank Statement',
        level: 2,
        parentId: 'folder-finance',
        ancestors: [
          { id: 'folder-project', title: 'Project' },
          { id: 'folder-finance', title: 'Finance' },
        ],
        emoji: '🏦',
      },
    ];

    it("shows the matching folder's own icon exactly once", () => {
      render(<FolderPicker items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Bank Statement' },
      });

      const row = document.querySelector('[role="menuitem"]');
      expect(row?.querySelectorAll('.emoji-icon')).toHaveLength(1);
      expect(row?.querySelector('.folder__icon .emoji-icon')?.textContent).toBe('🏦');
    });

    it('shows "Project / Finance" as folder__path below the title', () => {
      render(<FolderPicker items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Bank Statement' },
      });

      const row = document.querySelector('[role="menuitem"]');
      expect(row?.querySelector('.folder__title')?.textContent).toBe('Bank Statement');
      expect(row?.querySelector('.folder__path')?.textContent).toBe('Project / Finance');
    });

    it('the path is plain text — no icons inside it', () => {
      render(<FolderPicker items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Bank Statement' },
      });

      const path = document.querySelector('.folder__path');
      expect(path?.querySelector('.app-icon')).toBeNull();
      expect(path?.querySelector('.emoji-icon')).toBeNull();
    });

    it('a root-level search result renders no folder__path', () => {
      render(<FolderPicker items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Project' },
      });

      const row = document.querySelector('[role="menuitem"]');
      expect(row?.querySelector('.folder__title')?.textContent).toBe('Project');
      expect(row?.querySelector('.folder__path')).toBeNull();
    });
  });

  it('focuses the search input as soon as it mounts', () => {
    render(<FolderPicker items={items} onSelect={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search folders'));
  });

  describe('keyboard navigation (reuses useMenuKeyboard, the same hook OverflowMenu\'s <Menu> uses)', () => {
    it('highlights the first visible folder as soon as the picker renders', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} />);

      const projectRow = screen.getByText('Project').closest('.entry');
      expect(projectRow?.className).toContain('entry-force-hover');
    });

    it('ArrowDown moves the highlight to the next visible folder', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' });

      const financeRow = screen.getByText('Finance').closest('.entry');
      expect(financeRow?.className).toContain('entry-force-hover');
    });

    it('ArrowUp moves the highlight to the previous visible folder', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' }); // Project -> Finance
      fireEvent.keyDown(search, { key: 'ArrowUp' }); // Finance -> Project

      const projectRow = screen.getByText('Project').closest('.entry');
      expect(projectRow?.className).toContain('entry-force-hover');
    });

    it('Enter selects the highlighted folder', () => {
      const onSelect = vi.fn();
      render(<FolderPicker items={items} onSelect={onSelect} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' }); // Project -> Finance
      fireEvent.keyDown(search, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith(items[1]); // Finance
    });

    it('typing a space into the search box types a literal space, not a selection', () => {
      const onSelect = vi.fn();
      render(<FolderPicker items={items} onSelect={onSelect} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: ' ' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('changing the search query resets the highlight to the first matching result', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' }); // Project -> Finance
      fireEvent.change(search, { target: { value: 'Design' } });

      const designRow = document.querySelector('[role="menuitem"]');
      expect(designRow?.textContent).toContain('Design');
      expect(designRow?.className).toContain('entry-force-hover');
    });
  });

  describe('Create folder row', () => {
    it('a search term with no matching folder shows "Create <name>"', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      expect(screen.getByText('Create "Finance Q1"')).toBeDefined();
    });

    it('a search term matching an existing folder does not show Create', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance' },
      });

      expect(screen.queryByText('Create "Finance"')).toBeNull();
      expect(screen.getByText('Finance')).toBeDefined();
    });

    it('styles the Create row with the existing tertiary color treatment', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      const createRow = screen.getByText('Create "Finance Q1"').closest('.entry');
      expect(createRow?.className).toContain('tertiary');
    });

    it('clicking Create invokes onCreate with the trimmed search term', () => {
      const onCreate = vi.fn();
      render(<FolderPicker items={items} onSelect={vi.fn()} onCreate={onCreate} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: '  Finance Q1  ' },
      });
      fireEvent.click(screen.getByText('Create "Finance Q1"'));

      expect(onCreate).toHaveBeenCalledWith('Finance Q1');
    });

    it('Create becomes the highlighted item and participates in keyboard navigation (Enter activates it)', () => {
      const onCreate = vi.fn();
      render(<FolderPicker items={items} onSelect={vi.fn()} onCreate={onCreate} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.change(search, { target: { value: 'Finance Q1' } });

      const createRow = screen.getByText('Create "Finance Q1"').closest('.entry');
      expect(createRow?.className).toContain('entry-force-hover');

      fireEvent.keyDown(search, { key: 'Enter' });

      expect(onCreate).toHaveBeenCalledWith('Finance Q1');
    });

    it('never renders any root UI alongside the Create row', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      expect(screen.queryByText('Vault root')).toBeNull();
      expect(screen.queryByText('Move to vault root')).toBeNull();
      expect(screen.queryByText('Root')).toBeNull();
    });

    it('omits the Create row entirely when the caller supplies no onCreate', () => {
      render(<FolderPicker items={items} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      expect(screen.queryByText('Create "Finance Q1"')).toBeNull();
    });
  });
});
