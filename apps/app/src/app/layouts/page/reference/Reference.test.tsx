// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ReferenceEntry, ReferenceGroup, References } from './Reference';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

function Harness({
  tasks,
  notes,
  count = 3,
}: {
  tasks?: React.ReactNode;
  notes?: React.ReactNode;
  count?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <References
      count={count}
      isExpanded={isExpanded}
      onExpandToggle={() => setIsExpanded((value) => !value)}
      tasks={tasks}
      notes={notes}
    />
  );
}

const lists = () =>
  [...document.querySelectorAll('.reference__list')].map(
    (list) => list.textContent
  );
const dividers = () => document.querySelectorAll('.reference__divider').length;

describe('References', () => {
  it('renders nothing when there are no references at all', () => {
    const { container } = render(<Harness />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows one list under a single divider when only one kind has results', () => {
    render(<Harness tasks={<div>task row</div>} />);

    expect(lists()).toEqual(['task row']);
    expect(dividers()).toBe(1);

    cleanup();
    render(<Harness notes={<div>note row</div>} />);

    expect(lists()).toEqual(['note row']);
    expect(dividers()).toBe(1);
  });

  it('shows a divider above each list: tasks, then the notes list', () => {
    render(<Harness tasks={<div>task row</div>} notes={<div>note row</div>} />);

    expect(lists()).toEqual(['task row', 'note row']);
    expect(dividers()).toBe(2);
    expect(
      [...document.querySelector('.reference__content')!.children].map(
        (child) => child.className
      )
    ).toEqual([
      'reference__divider',
      'reference__list reference__tasks',
      'reference__divider',
      'reference__list reference__notes',
    ]);
  });

  const titles = () =>
    [...document.querySelectorAll('.section-header__title')].map(
      (node) => node.textContent
    );

  it('has no group headers — only the section title, with the total count', () => {
    render(<Harness tasks={<div>task row</div>} notes={<div>note row</div>} />);

    expect(titles()).toEqual(['3 References']);
  });

  it('reads "1 Reference" for a single reference and "9 References" for nine', () => {
    const { unmount } = render(
      <Harness notes={<div>note row</div>} count={1} />
    );
    expect(titles()).toEqual(['1 Reference']);
    unmount();

    render(<Harness notes={<div>note row</div>} count={9} />);
    expect(titles()).toEqual(['9 References']);
  });

  it('collapses and expands the whole section, reflecting it in aria-expanded', () => {
    render(<Harness tasks={<div>task row</div>} notes={<div>note row</div>} />);

    const header = screen.getByRole('button', { name: '3 References' });

    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(header);
    expect(screen.queryByText('task row')).toBeNull();
    expect(header).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(header);
    expect(screen.getByText('task row')).toBeInTheDocument();
    expect(screen.getByText('note row')).toBeInTheDocument();
  });
});

describe('ReferenceEntry', () => {
  const entry = (
    props: Partial<React.ComponentProps<typeof ReferenceEntry>> = {}
  ) => {
    const onOpen = vi.fn();
    render(
      <ReferenceEntry onOpen={onOpen} {...props}>
        some context
      </ReferenceEntry>
    );

    return {
      onOpen,
      row: document.querySelector('.reference__entry') as HTMLElement,
    };
  };

  it('has no wrapper between the entry and its body or checkbox', () => {
    const { row } = entry();

    expect(row.querySelector('.reference__main')).toBeNull();
    expect(row.children).toHaveLength(1);
    expect(row.firstElementChild).toHaveClass('reference-entry__body');
  });

  it('shows the clamped body, without a checkbox for a note', () => {
    entry();

    expect(document.querySelector('.reference-entry__body')).toHaveClass(
      'line-clamp-3'
    );
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('opens on click, Enter and Space', () => {
    const { onOpen, row } = entry();

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });

    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('a task entry shows its checkbox, and toggling it does not open the note', () => {
    const onCheckedChange = vi.fn();
    const { onOpen } = entry({ isChecked: false, onCheckedChange });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('marks a completed task body as completed', () => {
    entry({ isChecked: true, onCheckedChange: vi.fn() });

    expect(document.querySelector('.reference-entry__body')).toHaveClass(
      'is-completed'
    );
  });
});

describe('ReferenceGroup', () => {
  const group = () => {
    const onOpenPage = vi.fn();
    const onOpenFirst = vi.fn();
    const onOpenSecond = vi.fn();
    render(
      <ReferenceGroup title="Source note" onOpen={onOpenPage}>
        <ReferenceEntry onOpen={onOpenFirst}>first</ReferenceEntry>
        <ReferenceEntry onOpen={onOpenSecond}>second</ReferenceEntry>
      </ReferenceGroup>
    );

    return { onOpenPage, onOpenFirst, onOpenSecond };
  };

  it('shows the source page once, as a heading above its references', () => {
    group();

    expect(screen.getAllByText('Source note')).toHaveLength(1);
    const container = document.querySelector('.reference__group')!;
    expect(container.children[0]).toHaveClass('reference__heading');
    expect(container.children[1]).toHaveClass('reference__occurrences');
    expect(
      container.querySelectorAll('.reference__occurrences > .reference__entry')
    ).toHaveLength(2);
    // The heading is not an ancestor of the references: separate targets.
    expect(
      document.querySelector('.reference__heading .reference__entry')
    ).toBeNull();
  });

  it('opens the page from its heading by click, Enter and Space, and never opens a reference', () => {
    const { onOpenPage, onOpenFirst, onOpenSecond } = group();
    const heading = document.querySelector(
      '.reference__heading'
    ) as HTMLElement;

    expect(heading).toHaveAttribute('role', 'button');
    expect(heading).toHaveAttribute('tabindex', '0');
    fireEvent.click(heading);
    fireEvent.keyDown(heading, { key: 'Enter' });
    fireEvent.keyDown(heading, { key: ' ' });

    expect(onOpenPage).toHaveBeenCalledTimes(3);
    expect(onOpenFirst).not.toHaveBeenCalled();
    expect(onOpenSecond).not.toHaveBeenCalled();
  });

  it('makes every reference its own target: opening one never opens a sibling or the page', () => {
    const { onOpenPage, onOpenFirst, onOpenSecond } = group();
    const [first, second] = [
      ...document.querySelectorAll<HTMLElement>('.reference__entry'),
    ];

    fireEvent.click(second!);
    expect(onOpenSecond).toHaveBeenCalledTimes(1);
    expect(onOpenFirst).not.toHaveBeenCalled();

    fireEvent.keyDown(first!, { key: 'Enter' });
    expect(onOpenFirst).toHaveBeenCalledTimes(1);
    expect(onOpenSecond).toHaveBeenCalledTimes(1);
    expect(onOpenPage).not.toHaveBeenCalled();
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('role', 'button');
  });
});

describe('Reference.css: hover and radius belong to each item', () => {
  const css = readFileSync(join(__dirname, 'Reference.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );

  it('uses the existing hover token and radius on each reference, never on the group', () => {
    expect(css).toMatch(
      /\.reference__entry:hover\s*\{\s*background:\s*var\(--state-hover\);\s*\}/
    );
    expect(css).toMatch(
      /\.reference__entry\s*\{[^}]*border-radius:\s*var\(--radius-md\)/
    );
    expect(css).not.toMatch(/\.reference__group[^{]*:hover/);
    expect(css).not.toMatch(/\.reference__occurrences[^{]*:hover/);
  });

  it('makes the entry itself the layout row, with no wrapper between it and its checkbox and body', () => {
    expect(css).toMatch(
      /\.reference__entry\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*flex-start/
    );
    expect(css).not.toMatch(/reference__main|reference-entry__body--preview/);
  });
});

describe('References: showWhenEmpty (ADR-052)', () => {
  it('renders nothing for an empty section by default — the automatic hiding', () => {
    const { container } = render(<References count={0} isExpanded onExpandToggle={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps an empty section on screen with a 0 References header when explicitly shown', () => {
    const { container } = render(<References count={0} isExpanded onExpandToggle={() => {}} showWhenEmpty />);

    expect(screen.getByText('0 References')).toBeInTheDocument();
    expect(container.querySelector('.reference__content')).toBeNull();
  });

  it('showWhenEmpty changes nothing for a section that has results', () => {
    render(
      <References
        count={1}
        isExpanded
        onExpandToggle={() => {}}
        showWhenEmpty
        notes={<span>entry</span>}
      />
    );

    expect(screen.getByText('1 Reference')).toBeInTheDocument();
    expect(screen.getByText('entry')).toBeInTheDocument();
  });
});
