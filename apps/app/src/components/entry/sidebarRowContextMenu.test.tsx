// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DailyNote } from '@features/daily-notes/sidebar/DailyNote';
import { Folder } from '@features/notes/sidebar/Folder';
import { Resource } from '@features/notes/sidebar/Resource';
import { Note } from '@features/notes/sidebar/Note';
import { Tag } from '@features/tags/sidebar/Tag';
import { Task } from '@features/tasks/sidebar/Task';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

import { Entry } from './Entry';
import { EmptyEntry } from './EmptyEntry';
import { RowContextMenuEnabled } from './EntryMenuContext';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

const ITEMS: OverflowMenuItemConfig[] = [{ id: 'one', label: 'Only action' }];

/** Owns the open state the way a sidebar does (one row's `menuOpen`), recording selections. */
function Owned({ children }: { children: (menu: { menuItems: OverflowMenuItemConfig[]; menuOpen: boolean; onMenuOpenChange(open: boolean): void; onMenuSelect(id: string): void }) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>{children({ menuItems: ITEMS, menuOpen: open, onMenuOpenChange: setOpen, onMenuSelect: () => {} })}</>;
}

const Sidebar = ({ children }: { children: ReactNode }) => (
  <RowContextMenuEnabled value>
    <div data-testid="sidebar">{children}</div>
  </RowContextMenuEnabled>
);

const rows: [string, () => ReactNode, string][] = [
  ['a note', () => <Owned>{(m) => <Note title="Alpha" {...m} />}</Owned>, 'Alpha'],
  ['a folder', () => <Owned>{(m) => <Folder title="Projects" {...m} />}</Owned>, 'Projects'],
  ['a tag', () => <Owned>{(m) => <Tag title="work" count={1} {...m} />}</Owned>, 'work'],
  ['an asset', () => <Owned>{(m) => <Resource resource={{ id: 'r', kind: 'image', name: 'pic.png', path: '/v/pic.png', parentId: null } as never} {...m} />}</Owned>, 'pic'],
  ['a daily note', () => <Owned>{(m) => <DailyNote title="2026-08-04" {...m} />}</Owned>, '2026-08-04'],
  [
    'a task',
    () => (
      <Owned>
        {(m) => (
          <Task
            title="Ship it"
            isChecked={false}
            onDelete={() => {}}
            // Task builds its own menu from supplied operations; only the open state is the row's.
            {...{ onMenuOpenChange: m.onMenuOpenChange }}
          />
        )}
      </Owned>
    ),
    'Ship it',
  ],
];

const context = (element: Element, init: MouseEventInit = {}) => {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...init });
  fireEvent(element, event);
  return event;
};

describe('right-click on a sidebar row opens its More actions menu', () => {
  it.each(rows)('%s', (_name, row, label) => {
    render(<Sidebar>{row()}</Sidebar>);

    const event = context(screen.getByText(label));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('opens the same menu items the More actions button opens', () => {
    const { container, unmount } = render(<Sidebar>{rows[0]![1]()}</Sidebar>);
    fireEvent.click(container.querySelector('[aria-haspopup="menu"]')!);
    const viaButton = screen.getAllByRole('menuitem').map((item) => item.textContent);
    unmount();

    render(<Sidebar>{rows[0]![1]()}</Sidebar>);
    context(screen.getByText('Alpha'));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(viaButton);
  });

  it('opens the menu of the row that was right-clicked, even with another row selected', () => {
    const { container } = render(
      <Sidebar>
        <Owned>{(m) => <Note title="First" selected {...m} menuItems={[{ id: 'a', label: 'First action' }]} />}</Owned>
        <Owned>{(m) => <Note title="Second" {...m} menuItems={[{ id: 'b', label: 'Second action' }]} />}</Owned>
      </Sidebar>
    );

    context(screen.getByText('Second'));

    expect(screen.getByText('Second action')).toBeInTheDocument();
    expect(screen.queryByText('First action')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
  });

  it('does nothing for a row with no More actions menu, leaving the native menu alone', () => {
    render(
      <Sidebar>
        <Entry>Plain row</Entry>
        <EmptyEntry>Nothing here</EmptyEntry>
        <Note title="No menu" />
      </Sidebar>
    );

    for (const label of ['Plain row', 'Nothing here', 'No menu']) {
      expect(context(screen.getByText(label)).defaultPrevented).toBe(false);
    }
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('right-clicking the More actions button or another nested control opens no second menu', () => {
    const { container } = render(
      <Sidebar>
        <Owned>{(m) => <Task title="Task row" isChecked={false} onDelete={() => {}} {...{ onMenuOpenChange: m.onMenuOpenChange }} />}</Owned>
      </Sidebar>
    );

    context(container.querySelector('[aria-haspopup="menu"]')!);
    context(screen.getByRole('checkbox'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves an inline rename its native text menu', () => {
    render(
      <Sidebar>
        <Owned>{(m) => <Note title="Renaming" isEditing {...m} />}</Owned>
      </Sidebar>
    );

    expect(context(screen.getByRole('textbox')).defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it("does not fire the row's click, and single click is unchanged", () => {
    const onClick = vi.fn();
    render(
      <Sidebar>
        <Owned>{(m) => <Note title="Alpha" onClick={onClick} {...m} />}</Owned>
      </Sidebar>
    );

    fireEvent.click(screen.getByText('Alpha'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    context(screen.getByText('Alpha'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
  });

  it('a right-click inside the open menu dismisses it and never opens a second', () => {
    render(
      <Sidebar>
        <Owned>{(m) => <Note title="Alpha" {...m} />}</Owned>
      </Sidebar>
    );
    context(screen.getByText('Alpha'));

    const event = context(screen.getByText('Only action'));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens at the pointer, not anchored to the More actions button, and the button still anchors to itself', () => {
    const rect = (r: Partial<DOMRect>) => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {}, ...r }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('overlay__surface')) {
        return rect({ width: 100, height: 100, right: 100, bottom: 100 });
      }
      if (this.style.position === 'fixed') {
        const left = parseFloat(this.style.left);
        const top = parseFloat(this.style.top);
        return rect({ left, top, right: left, bottom: top });
      }
      if (this.getAttribute('aria-haspopup') === 'menu') {
        return rect({ left: 700, top: 500, right: 720, bottom: 520, width: 20, height: 20 });
      }
      return rect({});
    });
    const surface = () => document.querySelector<HTMLElement>('.overlay__surface')!;

    const { container, unmount } = render(<Sidebar>{rows[0]![1]()}</Sidebar>);
    context(screen.getByText('Alpha'), { clientX: 120, clientY: 90 });
    expect(parseFloat(surface().style.left)).toBe(120);
    expect(parseFloat(surface().style.top)).toBe(90);
    // Closing clears the pointer anchor: it is a menu of its own, not the button's.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.overlay__surface')).toBeNull();

    fireEvent.click(container.querySelector('[aria-haspopup="menu"]')!);
    expect(parseFloat(surface().style.top)).toBeGreaterThanOrEqual(520);
    expect(parseFloat(surface().style.left)).not.toBe(120);
    unmount();
    spy.mockRestore();
  });

  it('keeps the row highlighted (forced hover) while the context menu is open and clears it after', () => {
    const { container } = render(<Sidebar>{rows[0]![1]()}</Sidebar>);
    context(screen.getByText('Alpha'));
    expect(container.querySelector('.entry-force-hover')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.entry-force-hover')).toBeNull();
  });

  it('suppresses the native menu on the backdrop while open', () => {
    render(<Sidebar>{rows[0]![1]()}</Sidebar>);
    context(screen.getByText('Alpha'));

    const event = context(document.querySelector('.overlay__backdrop')!);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does nothing outside the Sidebar (rows not wrapped in the provider)', () => {
    render(<Note title="Alpha" menuItems={ITEMS} menuOpen={false} onMenuOpenChange={() => {}} />);
    expect(context(screen.getByText('Alpha')).defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
