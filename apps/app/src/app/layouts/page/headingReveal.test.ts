import { describe, expect, it, vi } from 'vitest';

import { findHeadingRevealRange, openPageAtHeading, type HeadingNavigationDeps } from './headingReveal';

const MARKDOWN = '# Decisions\n\nWe decided.\n^decision-1\n\n## Action Items\n\nDo things.\n\n```\n# Decisions\n```\n';

describe('findHeadingRevealRange', () => {
  it('is the heading’s own line', () => {
    expect(findHeadingRevealRange(MARKDOWN, 'Decisions')).toEqual({ from: 0, to: '# Decisions'.length });

    const action = MARKDOWN.indexOf('## Action Items');
    expect(findHeadingRevealRange(MARKDOWN, 'Action Items')).toEqual({ from: action, to: action + '## Action Items'.length });
  });

  it('matches by the shared rules: trimmed text, first match, never a heading inside code', () => {
    expect(findHeadingRevealRange(MARKDOWN, '  Decisions ')?.from).toBe(0);
    expect(findHeadingRevealRange('# A\n\n# A\n', 'A')?.from).toBe(0);
    expect(findHeadingRevealRange('```\n# Only in code\n```\n', 'Only in code')).toBeNull();
  });

  it('is null for a missing heading, and the last line needs no newline', () => {
    expect(findHeadingRevealRange(MARKDOWN, 'Nope')).toBeNull();
    expect(findHeadingRevealRange('# Last', 'Last')).toEqual({ from: 0, to: 6 });
  });
});

describe('openPageAtHeading', () => {
  function setup(markdowns: Record<string, string> = { p1: MARKDOWN }) {
    const calls: string[] = [];
    const deps: HeadingNavigationDeps = {
      open: vi.fn((id) => void calls.push(`open:${id}`)),
      getMarkdown: (id) => markdowns[id] ?? '',
      requestReveal: vi.fn((reveal) => void calls.push(`reveal:${reveal.pageId}`)),
    };
    return { deps, calls };
  }

  it('a plain link just opens the note, with no reveal request', () => {
    const { deps } = setup();

    openPageAtHeading(deps, 'p1');
    openPageAtHeading(deps, 'p1', null);

    expect(deps.open).toHaveBeenCalledTimes(2);
    expect(deps.requestReveal).not.toHaveBeenCalled();
  });

  it('a heading link opens the note, then asks the existing reveal pipeline to land on that heading’s line', () => {
    const { deps, calls } = setup();

    openPageAtHeading(deps, 'p1', 'Action Items');

    const action = MARKDOWN.indexOf('## Action Items');
    expect(deps.requestReveal).toHaveBeenCalledWith({ pageId: 'p1', ranges: [{ from: action, to: action + '## Action Items'.length }] });
    expect(calls).toEqual(['open:p1', 'reveal:p1']);
  });

  it('a second heading after the first requests that heading — each request carries its own target', () => {
    const { deps } = setup();

    openPageAtHeading(deps, 'p1', 'Decisions');
    openPageAtHeading(deps, 'p1', 'Action Items');

    const requests = vi.mocked(deps.requestReveal).mock.calls.map(([reveal]) => reveal.ranges[0]!.from);
    expect(requests).toEqual([0, MARKDOWN.indexOf('## Action Items')]);
  });

  it('uses the page’s current text, so an unsaved heading is found', () => {
    const { deps } = setup({ p1: '# Brand New\n' });

    openPageAtHeading(deps, 'p1', 'Brand New');

    expect(deps.requestReveal).toHaveBeenCalledWith({ pageId: 'p1', ranges: [{ from: 0, to: 11 }] });
  });

  it.each(['Nope', '^decision-1', ''])('%j opens the note and requests no reveal — never an error', (heading) => {
    const { deps } = setup();

    expect(() => openPageAtHeading(deps, 'p1', heading)).not.toThrow();

    expect(deps.open).toHaveBeenCalledWith('p1');
    expect(deps.requestReveal).not.toHaveBeenCalled();
  });
});
