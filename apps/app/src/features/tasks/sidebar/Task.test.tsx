// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Task } from './Task';

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
