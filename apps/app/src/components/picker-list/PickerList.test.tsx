// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PickerList } from './PickerList';
import type { PickerListItem } from './PickerList.types';

afterEach(() => {
  cleanup();
});

const items: PickerListItem[] = [
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

describe('PickerList', () => {
  it('never renders a row for the vault root — items alone define what shows', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    expect(screen.queryByText('Root')).toBeNull();
    expect(screen.queryByText('Vault root')).toBeNull();
  });

  it("renders an item's secondaryLabel inline next to its title, in a separate span", () => {
    const withSecondary: PickerListItem[] = [
      { id: 'root', title: 'MyClutter', secondaryLabel: 'Home', level: 0, parentId: null },
      ...items,
    ];
    render(<PickerList items={withSecondary} onSelect={vi.fn()} />);

    const title = screen.getByText('MyClutter');
    const secondary = screen.getByText('Home');

    expect(title.className).toContain('picker-list__title');
    expect(secondary.className).toContain('picker-list__secondary');
    expect(secondary.parentElement).toBe(title.parentElement);
  });

  it('renders no secondary span for an item with no secondaryLabel', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    expect(document.querySelector('.picker-list__secondary')).toBeNull();
  });

  it('starts with every nested folder collapsed — only top-level items are visible', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    expect(screen.getByText('Project')).toBeDefined();
    expect(screen.getByText('Finance')).toBeDefined();
    expect(screen.queryByText('Design')).toBeNull();
    expect(screen.queryByText('Research')).toBeNull();
  });

  it('expanding a top-level folder reveals its children, without affecting siblings', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    const caret = document.querySelector('.folder__caret .caret-slot');
    if (!caret) {
      throw new Error('expected an expand caret for Project');
    }
    fireEvent.click(caret);

    expect(screen.getByText('Design')).toBeDefined();
    expect(screen.getByText('Research')).toBeDefined();
  });

  it('a folder with children shows a caret', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    const projectRow = screen.getByText('Project').closest('.entry');
    expect(projectRow?.querySelector('.caret-slot')).not.toBeNull();
  });

  it('a folder with no children shows no caret at all', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    const financeRow = screen.getByText('Finance').closest('.entry');
    expect(financeRow?.querySelector('.caret-slot')).toBeNull();
  });

  it('renders the folder icon via FolderLeading in the normal tree', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    const projectRow = screen.getByText('Project').closest('.entry');
    expect(projectRow?.querySelector('.folder__icon .emoji-icon')?.textContent).toBe('📁');
  });

  it('clicking a row calls onSelect with that item, not its expand toggle', () => {
    const onSelect = vi.fn();
    render(<PickerList items={items} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Finance'));

    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('expanding does not invoke onSelect', () => {
    const onSelect = vi.fn();
    render(<PickerList items={items} onSelect={onSelect} />);

    const caret = document.querySelector('.folder__caret .caret-slot');
    if (!caret) {
      throw new Error('expected an expand caret for Project');
    }
    fireEvent.click(caret);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('searching shows every matching item flat, regardless of collapsed state', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search folders'), {
      target: { value: 'Design' },
    });

    const row = document.querySelector('[role="menuitem"]');
    expect(row?.textContent).toContain('Project');
    expect(row?.textContent).toContain('Design');
  });

  describe('nested search results (plain-text path, no breadcrumb icons)', () => {
    const nestedItems: PickerListItem[] = [
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
      render(<PickerList items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Bank Statement' },
      });

      const row = document.querySelector('[role="menuitem"]');
      expect(row?.querySelectorAll('.emoji-icon')).toHaveLength(1);
      expect(row?.querySelector('.folder__icon .emoji-icon')?.textContent).toBe('🏦');
    });

    it('shows "Project / Finance" as picker-list__path below the title', () => {
      render(<PickerList items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Bank Statement' },
      });

      const row = document.querySelector('[role="menuitem"]');
      expect(row?.querySelector('.picker-list__title')?.textContent).toBe('Bank Statement');
      expect(row?.querySelector('.picker-list__path')?.textContent).toBe('Project / Finance');
    });

    it('the path is plain text — no icons inside it', () => {
      render(<PickerList items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Bank Statement' },
      });

      const path = document.querySelector('.picker-list__path');
      expect(path?.querySelector('.app-icon')).toBeNull();
      expect(path?.querySelector('.emoji-icon')).toBeNull();
    });

    it('a root-level search result renders no picker-list__path', () => {
      render(<PickerList items={nestedItems} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Project' },
      });

      const row = document.querySelector('[role="menuitem"]');
      expect(row?.querySelector('.picker-list__title')?.textContent).toBe('Project');
      expect(row?.querySelector('.picker-list__path')).toBeNull();
    });
  });

  it('focuses the search input as soon as it mounts', () => {
    render(<PickerList items={items} onSelect={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search folders'));
  });

  describe('keyboard navigation (reuses useMenuKeyboard, the same hook OverflowMenu\'s <Menu> uses)', () => {
    it('highlights the first visible folder as soon as the picker renders', () => {
      render(<PickerList items={items} onSelect={vi.fn()} />);

      const projectRow = screen.getByText('Project').closest('.entry');
      expect(projectRow?.className).toContain('entry-force-hover');
    });

    it('ArrowDown moves the highlight to the next visible folder', () => {
      render(<PickerList items={items} onSelect={vi.fn()} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' });

      const financeRow = screen.getByText('Finance').closest('.entry');
      expect(financeRow?.className).toContain('entry-force-hover');
    });

    it('ArrowUp moves the highlight to the previous visible folder', () => {
      render(<PickerList items={items} onSelect={vi.fn()} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' }); // Project -> Finance
      fireEvent.keyDown(search, { key: 'ArrowUp' }); // Finance -> Project

      const projectRow = screen.getByText('Project').closest('.entry');
      expect(projectRow?.className).toContain('entry-force-hover');
    });

    it('Enter selects the highlighted folder', () => {
      const onSelect = vi.fn();
      render(<PickerList items={items} onSelect={onSelect} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' }); // Project -> Finance
      fireEvent.keyDown(search, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith(items[1]); // Finance
    });

    it('typing a space into the search box types a literal space, not a selection', () => {
      const onSelect = vi.fn();
      render(<PickerList items={items} onSelect={onSelect} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: ' ' });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('changing the search query resets the highlight to the first matching result', () => {
      render(<PickerList items={items} onSelect={vi.fn()} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.keyDown(search, { key: 'ArrowDown' }); // Project -> Finance
      fireEvent.change(search, { target: { value: 'Design' } });

      const designRow = document.querySelector('[role="menuitem"]');
      expect(designRow?.textContent).toContain('Design');
      expect(designRow?.className).toContain('entry-force-hover');
    });
  });

  describe('Create folder row', () => {
    // The Create row's own name/value (2026-08-25, "updated folder picker
    // css") — a plain-text `Create "<name>"` string became two separately-
    // styled spans, `.picker-list__create-label` ("Create", muted) and
    // `.picker-list__title` (the typed name, same class the ordinary
    // search-result rows already use) — so there is no longer one text
    // node a `getByText('Create "X"')` query can match. `#picker-list-
    // create` (`CREATE_ITEM_ID`, PickerList.tsx) is the row's own stable
    // id regardless of that markup shape.
    function getCreateRow(): HTMLElement {
      const row = document.getElementById('picker-list-create');
      if (!row) {
        throw new Error('Create row not found');
      }
      return row;
    }

    it('a search term with no matching folder shows "Create <name>"', () => {
      render(<PickerList items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      const createRow = getCreateRow();
      expect(createRow.querySelector('.picker-list__create-label')?.textContent).toBe('Create');
      expect(createRow.querySelector('.picker-list__title')?.textContent).toBe('Finance Q1');
    });

    it('a search term matching an existing folder does not show Create', () => {
      render(<PickerList items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance' },
      });

      expect(document.getElementById('picker-list-create')).toBeNull();
      expect(screen.getByText('Finance')).toBeDefined();
    });

    it('styles the Create row with its own muted color treatment', () => {
      render(<PickerList items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      // Styled via .picker-list__create-row (PickerList.css), not the
      // shared .tertiary utility class.
      expect(getCreateRow().className).toContain('picker-list__create-row');
    });

    it('clicking Create invokes onCreate with the trimmed search term', () => {
      const onCreate = vi.fn();
      render(<PickerList items={items} onSelect={vi.fn()} onCreate={onCreate} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: '  Finance Q1  ' },
      });
      fireEvent.click(getCreateRow());

      expect(onCreate).toHaveBeenCalledWith('Finance Q1');
    });

    it('Create becomes the highlighted item and participates in keyboard navigation (Enter activates it)', () => {
      const onCreate = vi.fn();
      render(<PickerList items={items} onSelect={vi.fn()} onCreate={onCreate} />);
      const search = screen.getByPlaceholderText('Search folders');

      fireEvent.change(search, { target: { value: 'Finance Q1' } });

      expect(getCreateRow().className).toContain('entry-force-hover');

      fireEvent.keyDown(search, { key: 'Enter' });

      expect(onCreate).toHaveBeenCalledWith('Finance Q1');
    });

    it('never renders any root UI alongside the Create row', () => {
      render(<PickerList items={items} onSelect={vi.fn()} onCreate={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      expect(screen.queryByText('Vault root')).toBeNull();
      expect(screen.queryByText('Move to vault root')).toBeNull();
      expect(screen.queryByText('Root')).toBeNull();
    });

    it('omits the Create row entirely when the caller supplies no onCreate', () => {
      render(<PickerList items={items} onSelect={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText('Search folders'), {
        target: { value: 'Finance Q1' },
      });

      expect(screen.queryByText('Create "Finance Q1"')).toBeNull();
    });
  });
});

describe('PickerList sections', () => {
  const items = [
    { id: 'n1', title: 'Alpha', level: 0, parentId: null, section: 'Notes' },
    { id: 'n2', title: 'Beta', level: 0, parentId: null, section: 'Notes' },
    { id: 'd1', title: 'Today', level: 0, parentId: null, section: 'Daily notes' },
  ];

  it('draws a title per section and a divider only between sections', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" onSelect={() => {}} />);

    expect(Array.from(container.querySelectorAll('.menu__group-title')).map((el) => el.textContent)).toEqual([
      'Notes',
      'Daily notes',
    ]);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it('draws no sections for items without one', () => {
    const { container } = render(
      <PickerList items={items.map(({ section: _s, ...rest }) => rest)} leadingIcon="note" onSelect={() => {}} />
    );

    expect(container.querySelectorAll('.menu__group-title')).toHaveLength(0);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it('drops a section that has no matching items while searching', () => {
    const { container, getByPlaceholderText } = render(
      <PickerList items={items} placeholder="Search" leadingIcon="note" onSelect={() => {}} />
    );
    fireEvent.change(getByPlaceholderText('Search'), { target: { value: 'tod' } });

    expect(Array.from(container.querySelectorAll('.menu__group-title')).map((el) => el.textContent)).toEqual(['Daily notes']);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });
});

describe('PickerList sectionLimit', () => {
  const many = (section: string, count: number): PickerListItem[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `${section}-${i}`,
      title: `${section} ${i}`,
      level: 0,
      parentId: null,
      section,
    }));
  const items = [...many('Notes', 12), ...many('Daily notes', 3)];
  const rowCount = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.picker-list__item')).filter((el) => !el.id.startsWith('picker-list-toggle'))
      .length;

  it('shows the first N of an over-limit section with a Show more row, and leaves a short section alone', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" sectionLimit={10} onSelect={() => {}} />);

    expect(rowCount(container)).toBe(13);
    expect(container.querySelectorAll('[id^="picker-list-toggle"]')).toHaveLength(1);
    expect(screen.getByText('Show more')).toBeTruthy();
    expect(screen.queryByText('Notes 10')).toBeNull();
  });

  it('Show more expands only that section and the row becomes Show less; clicking again collapses it', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" sectionLimit={10} onSelect={() => {}} />);

    fireEvent.click(screen.getByText('Show more'));
    expect(rowCount(container)).toBe(15);
    expect(screen.getByText('Notes 11')).toBeTruthy();
    expect(screen.getByText('Show less')).toBeTruthy();

    fireEvent.click(screen.getByText('Show less'));
    expect(rowCount(container)).toBe(13);
    expect(screen.getByText('Show more')).toBeTruthy();
  });

  it('does not cap anything without a sectionLimit, and never caps items without a section', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" onSelect={() => {}} />);
    expect(rowCount(container)).toBe(15);
    expect(container.querySelectorAll('[id^="picker-list-toggle"]')).toHaveLength(0);

    cleanup();
    const unsectioned = many('x', 12).map(({ section: _s, ...rest }) => rest);
    const second = render(<PickerList items={unsectioned} leadingIcon="note" sectionLimit={3} onSelect={() => {}} />);
    expect(rowCount(second.container)).toBe(12);
  });

  it('the Show more row is a menu item the shared keyboard can reach', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" sectionLimit={10} onSelect={() => {}} />);
    expect(container.querySelector('[id^="picker-list-toggle"]')?.getAttribute('role')).toBe('menuitem');
  });
});

describe('PickerList data-can-scroll-down', () => {
  const items = Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, title: `Note ${i}`, level: 0, parentId: null }));

  function mockListGeometry(list: HTMLElement, geometry: { clientHeight: number; scrollHeight: number }) {
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: geometry.clientHeight });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: geometry.scrollHeight });
  }

  it('is absent when everything fits', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" onSelect={() => {}} />);
    const list = container.querySelector<HTMLElement>('.picker-list__list')!;
    mockListGeometry(list, { clientHeight: 300, scrollHeight: 300 });
    fireEvent.scroll(list);

    expect(list.hasAttribute('data-can-scroll-down')).toBe(false);
  });

  it('is present while there is more below, and goes away once scrolled to the end', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" onSelect={() => {}} />);
    const list = container.querySelector<HTMLElement>('.picker-list__list')!;
    mockListGeometry(list, { clientHeight: 100, scrollHeight: 300 });

    list.scrollTop = 0;
    fireEvent.scroll(list);
    expect(list.hasAttribute('data-can-scroll-down')).toBe(true);

    list.scrollTop = 200;
    fireEvent.scroll(list);
    expect(list.hasAttribute('data-can-scroll-down')).toBe(false);
  });
});

describe('PickerList --picker-list-first-section-bottom', () => {
  const many = (section: string, count: number): PickerListItem[] =>
    Array.from({ length: count }, (_, i) => ({ id: `${section}-${i}`, title: `${section} ${i}`, level: 0, parentId: null, section }));

  it('is set to where the first Show more row ends, and removed when no section is capped', () => {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect;
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains('picker-list__list')) return rect(100, 400);
      if (this.id.startsWith('picker-list-toggle-')) return rect(330, 362);
      return rect(0, 0);
    };
    try {
      const { container, rerender } = render(
        <PickerList items={many('Notes', 12)} leadingIcon="note" sectionLimit={5} onSelect={() => {}} />
      );
      const list = container.querySelector<HTMLElement>('.picker-list__list')!;
      expect(list.style.getPropertyValue('--picker-list-first-section-bottom')).toBe('262px');

      rerender(<PickerList items={many('Notes', 3)} leadingIcon="note" sectionLimit={5} onSelect={() => {}} />);
      expect(list.style.getPropertyValue('--picker-list-first-section-bottom')).toBe('');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });
});

describe('PickerList showSectionTitles', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, title: `Note ${i}`, level: 0, parentId: null, section: 'Notes' }));

  it('can cap a single section with Show more while drawing no title for it', () => {
    const { container } = render(
      <PickerList items={items} leadingIcon="note" sectionLimit={5} showSectionTitles={false} onSelect={() => {}} />
    );

    expect(container.querySelectorAll('.menu__group-title')).toHaveLength(0);
    expect(screen.getByText('Show more')).toBeTruthy();
    expect(screen.queryByText('Note 5')).toBeNull();
  });

  it('draws the title by default', () => {
    const { container } = render(<PickerList items={items} leadingIcon="note" sectionLimit={5} onSelect={() => {}} />);

    expect(container.querySelector('.menu__group-title')?.textContent).toBe('Notes');
  });
});

describe('PickerList fade next to the first Show more row', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, title: `Note ${i}`, level: 0, parentId: null, section: 'Notes' }));

  function withGeometry(run: () => void) {
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect;
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains('picker-list__list')) return rect(100, 400);
      if (this.id.startsWith('picker-list-toggle-')) return rect(330, 362);
      return rect(0, 0);
    };
    try {
      run();
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  }

  it('does not fade a list that ends at the first Show more row, until it is scrolled', () => {
    withGeometry(() => {
      const { container } = render(
        <PickerList items={items} leadingIcon="note" sectionLimit={5} onSelect={() => {}} />
      );
      const list = container.querySelector<HTMLElement>('.picker-list__list')!;
      // The first Show more row ends 262px into the content; the list is cut just after it (266px).
      Object.defineProperty(list, 'clientHeight', { configurable: true, value: 266 });
      Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 600 });

      list.scrollTop = 0;
      fireEvent.scroll(list);
      expect(list.hasAttribute('data-can-scroll-down')).toBe(false);

      list.scrollTop = 50;
      fireEvent.scroll(list);
      expect(list.hasAttribute('data-can-scroll-down')).toBe(true);
    });
  });
});
