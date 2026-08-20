// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyNote } from './DailyNote';

afterEach(() => {
  cleanup();
});

describe('DailyNote — compact Markdown title rendering', () => {
  it('renders a plain-text title verbatim, unchanged from before', () => {
    render(<DailyNote title="Plain title" />);

    expect(screen.getByText('Plain title')).toBeDefined();
  });

  it('renders mixed Markdown in the title as compact Markdown, not raw syntax', () => {
    const { container } = render(
      <DailyNote title="**Ship** [[Project Alpha]] by @2020-01-15 #urgent" />
    );

    const titleEl = container.querySelector('.daily-note__title')!;
    expect(titleEl.querySelector('strong')).toHaveTextContent('Ship');
    expect(titleEl.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Project Alpha');
    expect(titleEl.querySelector('.compact-markdown-tag')).toHaveTextContent('#urgent');
    expect(titleEl.querySelector('.compact-markdown-date')).toHaveTextContent('@15 January 2020');
    expect(titleEl).not.toHaveTextContent('**Ship**');
    expect(titleEl).not.toHaveTextContent('[[Project Alpha]]');
  });

  it('resolves a Tag title through the injected resolveTag, not the fallback', () => {
    const resolveTag = vi.fn().mockReturnValue({
      status: 'resolved' as const,
      displayLabel: 'Resolved Tag',
      activate: () => {},
    });

    const { container } = render(<DailyNote title="#Product_design" resolveTag={resolveTag} />);

    expect(resolveTag).toHaveBeenCalledWith('Product_design');
    expect(container.querySelector('.compact-markdown-tag')).toHaveTextContent('#Resolved Tag');
  });

  it('row click still fires normally when the title contains Markdown', () => {
    const onClick = vi.fn();
    render(<DailyNote title="**Ship** it" onClick={onClick} />);

    fireEvent.click(screen.getByText('Ship').closest('.entry')!);

    expect(onClick).toHaveBeenCalled();
  });
});
