// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Task } from './Task';

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

describe('Task — compact Markdown title rendering', () => {
  it('renders a plain-text title verbatim, unchanged from before', () => {
    render(<Task title="Plain title" isChecked={false} />);

    expect(screen.getByText('Plain title')).toBeDefined();
  });

  it('renders **bold**, *italic*, ~~strikethrough~~, and `code` as semantic HTML, not raw syntax', () => {
    const { container } = render(
      <Task title="**bold** *italic* ~~strike~~ `code`" isChecked={false} />
    );

    const title = container.querySelector('.task-title')!;
    expect(title.querySelector('strong')).toHaveTextContent('bold');
    expect(title.querySelector('em')).toHaveTextContent('italic');
    expect(title.querySelector('s')).toHaveTextContent('strike');
    expect(title.querySelector('code')).toHaveTextContent('code');
    expect(title).not.toHaveTextContent('**bold**');
    expect(title).not.toHaveTextContent('~~strike~~');
  });

  it('renders a WikiLink and a Tag through the shared compact renderer', () => {
    const { container } = render(
      <Task title="[[Project Alpha]] #urgent" isChecked={false} />
    );

    const title = container.querySelector('.task-title')!;
    expect(title.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Project Alpha');
    expect(title.querySelector('.compact-markdown-tag')).toHaveTextContent('#urgent');
  });

  it('resolves a WikiLink/Tag title through injected resolvers, not the fallback', () => {
    const resolveWikiLink = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      displayLabel: 'Resolved Link',
      activate: () => {},
    });
    const resolveTag = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      displayLabel: 'Resolved Tag',
      activate: () => {},
    });

    const { container } = render(
      <Task
        title="[[Projects/Alpha|Alpha]] #urgent"
        isChecked={false}
        resolveWikiLink={resolveWikiLink}
        resolveTag={resolveTag}
      />
    );

    expect(resolveWikiLink).toHaveBeenCalledWith('Projects/Alpha', 'Alpha');
    expect(resolveTag).toHaveBeenCalledWith('urgent');
    const title = container.querySelector('.task-title')!;
    expect(title.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Resolved Link');
    expect(title.querySelector('.compact-markdown-tag')).toHaveTextContent('#Resolved Tag');
  });

  it('resolves an Embed title through the injected resolveEmbed, not the raw target path', () => {
    const resolveEmbed = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      pageId: 'page-1',
      title: 'Project Alpha',
      markdown: '',
      icon: 'note' as const,
      emoji: null,
    });

    const { container } = render(
      <Task title="![[Projects/Alpha]]" isChecked={false} resolveEmbed={resolveEmbed} />
    );

    expect(resolveEmbed).toHaveBeenCalledWith('Projects/Alpha');
    expect(container.querySelector('.task-title')).toHaveTextContent('Project Alpha');
    expect(container).not.toHaveTextContent('![[');
  });

  it('renders a shape-valid but calendar-invalid bare date as its own raw, unformatted text', () => {
    const { container } = render(<Task title="Follow up @2026-13-45" isChecked={false} />);

    const dateSpan = container.querySelector('.compact-markdown-date')!;
    expect(dateSpan).toHaveAttribute('data-date-status', 'invalid');
    expect(dateSpan).toHaveTextContent('@2026-13-45');
  });

  it('row click and checkbox toggle still fire normally when the title contains Markdown', () => {
    const onClick = vi.fn();
    const onCheckedChange = vi.fn();
    render(
      <Task
        title="**Ship** it"
        isChecked={false}
        onClick={onClick}
        onCheckedChange={onCheckedChange}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Ship').closest('.entry')!);
    expect(onClick).toHaveBeenCalled();
  });

  it('still renders the trailing due-date badge unaffected by title Markdown', () => {
    render(<Task title="**Ship** it" dueDate="20 Aug" isChecked={false} />);

    expect(screen.getByText('20 Aug')).toBeDefined();
  });
});

// OverflowMenu's trigger is the one button with aria-haspopup="menu" — same
// selector convention Sidebar.Notes.test.tsx/FolderTree.rowActions.test.tsx
// already use for the identical primitive.
function openMenu(container: HTMLElement) {
  const trigger = container.querySelector('button[aria-haspopup="menu"]')!;
  fireEvent.click(trigger);
}

describe('Task — More Actions menu', () => {
  it('omits the menu trigger entirely when no callback is provided (OverflowMenu renders nothing for an empty item list)', () => {
    const { container } = render(<Task title="Finish table work" isChecked={false} />);

    expect(container.querySelector('button[aria-haspopup="menu"]')).toBeNull();
  });

  it('renders Edit, Change due date, Open in note, and Delete when their callbacks are provided', () => {
    const { container } = render(
      <Task
        title="Finish table work"
        isChecked={false}
        onEdit={vi.fn()}
        onChangeDueDate={vi.fn()}
        onOpenInNote={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    openMenu(container);

    expect(screen.getByText('Edit')).toBeDefined();
    expect(screen.getByText('Change due date')).toBeDefined();
    expect(screen.getByText('Open in note')).toBeDefined();
    expect(screen.getByText('Delete')).toBeDefined();
  });

  it('selecting Edit calls onEdit and closes the menu', () => {
    const onEdit = vi.fn();
    const { container } = render(
      <Task title="Finish table work" isChecked={false} onEdit={onEdit} />
    );

    openMenu(container);
    fireEvent.click(screen.getByText('Edit'));

    expect(onEdit).toHaveBeenCalled();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('selecting Open in note calls onOpenInNote, not the row\'s own onClick', () => {
    const onClick = vi.fn();
    const onOpenInNote = vi.fn();
    const { container } = render(
      <Task
        title="Finish table work"
        isChecked={false}
        onClick={onClick}
        onOpenInNote={onOpenInNote}
      />
    );

    openMenu(container);
    fireEvent.click(screen.getByText('Open in note'));

    expect(onOpenInNote).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('selecting Delete calls onDelete', () => {
    const onDelete = vi.fn();
    const { container } = render(
      <Task title="Finish table work" isChecked={false} onDelete={onDelete} />
    );

    openMenu(container);
    fireEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalled();
  });

  it('clicking the menu trigger does not trigger the row\'s own onClick', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Task title="Finish table work" isChecked={false} onClick={onClick} onEdit={vi.fn()} />
    );

    openMenu(container);

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Task — Change due date action', () => {
  it('opens the existing Calendar overlay, pre-selected to the task\'s current date', () => {
    const { container } = render(
      <Task
        title="Finish table work"
        isChecked={false}
        date="2026-09-28"
        onChangeDueDate={vi.fn()}
      />
    );

    expect(document.querySelector('.calendar')).toBeNull();

    openMenu(container);
    fireEvent.click(screen.getByText('Change due date'));

    const calendar = document.querySelector('.calendar');
    expect(calendar).not.toBeNull();
    expect(calendar!.querySelector('.calendar-cell--selected')).not.toBeNull();
  });

  it('opens with nothing pre-selected when the task has no date yet', () => {
    const { container } = render(
      <Task title="Finish table work" isChecked={false} onChangeDueDate={vi.fn()} />
    );

    openMenu(container);
    fireEvent.click(screen.getByText('Change due date'));

    const calendar = document.querySelector('.calendar')!;
    expect(calendar.querySelector('.calendar-cell--selected')).toBeNull();
  });

  it('selecting a date in the calendar calls onChangeDueDate with the selected date and closes the overlay', () => {
    const onChangeDueDate = vi.fn();
    const { container } = render(
      <Task
        title="Finish table work"
        isChecked={false}
        date="2026-09-28"
        onChangeDueDate={onChangeDueDate}
      />
    );

    openMenu(container);
    fireEvent.click(screen.getByText('Change due date'));

    // '15' is unambiguous within September 2026's grid — the only
    // outside-month padding days that month shows are Aug 30-31 (leading)
    // and Oct 1-10 (trailing), so a mid-month digit can't collide with them.
    const targetDay = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '.calendar-cell:not(.calendar-cell--outside-month)'
      )
    ).find((button) => button.textContent?.trim() === '15');
    expect(targetDay).toBeDefined();

    fireEvent.click(targetDay!);

    expect(onChangeDueDate).toHaveBeenCalledWith('2026-09-15');
    expect(document.querySelector('.calendar')).toBeNull();
  });

  it('"Clear date" calls onChangeDueDate with null and closes the overlay', () => {
    const onChangeDueDate = vi.fn();
    const { container } = render(
      <Task
        title="Finish table work"
        isChecked={false}
        date="2026-09-28"
        onChangeDueDate={onChangeDueDate}
      />
    );

    openMenu(container);
    fireEvent.click(screen.getByText('Change due date'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));

    expect(onChangeDueDate).toHaveBeenCalledWith(null);
    expect(document.querySelector('.calendar')).toBeNull();
  });

  it('disables "Clear date" when the task has no date yet', () => {
    const { container } = render(
      <Task title="Finish table work" isChecked={false} onChangeDueDate={vi.fn()} />
    );

    openMenu(container);
    fireEvent.click(screen.getByText('Change due date'));

    expect(screen.getByRole('button', { name: 'Clear date' })).toBeDisabled();
  });
});
