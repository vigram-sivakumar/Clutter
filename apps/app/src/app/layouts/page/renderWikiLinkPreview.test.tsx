// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Vault } from '@core/vault/models/Vault';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';

import { createWikiLinkPreviewRenderer } from './renderWikiLinkPreview';

function fakePage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    type: 'note',
    name: 'My Project',
    path: '/vault/My Project.md',
    metadata: { icon: null },
    source: { markdown: 'Committed body' },
    ...overrides,
  };
}

function setup(
  page: ReturnType<typeof fakePage> | undefined,
  effective?: Record<string, unknown>,
  inTemplates = false,
  options: { showHeader?: boolean } = { showHeader: true }
) {
  const getPage = vi.fn(() => page);
  const getEffective = vi.fn(() => effective);
  const renderPreview = createWikiLinkPreviewRenderer(
    {
      getPage,
      isFolderWithinReservedFolder: () => inTemplates,
    } as unknown as Vault,
    { getPage: getEffective } as unknown as EffectivePageState,
    {},
    options
  );
  return { getPage, getEffective, renderPreview };
}

afterEach(cleanup);

const show = (node: unknown) => render(<>{node as never}</>);

describe('createWikiLinkPreviewRenderer', () => {
  it('by default shows no header: the page canvas alone, with the cover and content on it', () => {
    const { renderPreview } = setup(
      fakePage(),
      {
        name: 'My Project',
        markdown: 'Body',
        icon: null,
        cover: 'c.png',
        coverHidden: false,
        coverPositionAbove: 50,
      },
      false,
      {}
    );

    const { container, queryByText } = show(
      renderPreview({ kind: 'resolved', pageId: 'p1' })
    );

    expect(container.querySelector('.card-title')).toBeNull();
    expect(queryByText('My Project')).toBeNull();
    expect(container.querySelector('.note-page-canvas')).not.toBeNull();
  });

  it('by default an unresolved link previews as an empty note with no header', () => {
    const { renderPreview } = setup(fakePage(), undefined, false, {});

    const { container } = show(
      renderPreview({ kind: 'unresolved', title: 'My New Idea' })
    );

    expect(container.querySelector('.card-title')).toBeNull();
    expect(
      container.querySelector('.note-preview-card__empty')
    ).toHaveTextContent('Empty note');
  });

  it('a note in Templates previews with the template icon, an ordinary note with the note icon', () => {
    const markup = (inTemplates: boolean) => {
      const { renderPreview } = setup(
        fakePage(),
        { name: 'My Project', markdown: 'x', icon: null },
        inTemplates
      );
      return show(renderPreview({ kind: 'resolved', pageId: 'p1' })).container
        .innerHTML;
    };
    const templateMarkup = markup(true);
    cleanup();
    const noteMarkup = markup(false);

    expect(templateMarkup).not.toBe(noteMarkup);
  });

  it('previews an existing page by id: its title and rendered content', () => {
    const { renderPreview, getPage } = setup(fakePage(), {
      name: 'My Project',
      markdown: '**Live** body',
      icon: null,
    });

    const { container, getByText } = show(
      renderPreview({ kind: 'resolved', pageId: 'p1' })
    );

    expect(getPage).toHaveBeenCalledWith('p1');
    expect(getByText('My Project')).toBeInTheDocument();
    expect(container.querySelector('.note-preview-card__empty')).toBeNull();
    expect(container.querySelector('.note-page-canvas')).not.toBeNull();
  });

  it("shows the page's current (renamed) name, since it is loaded by id", () => {
    const { renderPreview } = setup(fakePage({ name: 'My Project' }), {
      name: 'My New Project',
      markdown: 'x',
      icon: null,
    });

    const { getByText, queryByText } = show(
      renderPreview({ kind: 'resolved', pageId: 'p1' })
    );

    expect(getByText('My New Project')).toBeInTheDocument();
    expect(queryByText('My Project')).toBeNull();
  });

  it('titles a Daily Note with its human-readable date, never the YYYY-MM-DD filename', () => {
    const { renderPreview } = setup(
      fakePage({
        type: 'daily-note',
        name: '2026-10-04',
        path: '/vault/Daily Notes/2026/10/2026-10-04.md',
      }),
      {
        name: '2026-10-04',
        markdown: "Today's note",
        icon: null,
      }
    );

    const { container } = show(
      renderPreview({ kind: 'resolved', pageId: 'p1' })
    );

    const title = container.querySelector('.card-title-section__title')!.textContent!;
    expect(title).toContain('October 2026');
    expect(title).not.toContain('2026-10-04');
  });

  it('shows an existing page with no content as an empty note', () => {
    const { renderPreview } = setup(
      fakePage({ source: { markdown: '  ' } }),
      undefined
    );

    const { container } = show(
      renderPreview({ kind: 'resolved', pageId: 'p1' })
    );

    expect(
      container.querySelector('.note-preview-card__empty')
    ).toHaveTextContent('Empty note');
  });

  it("previews a missing page as an empty note under the link's own title — without loading any page", () => {
    const { renderPreview, getPage, getEffective } = setup(fakePage());

    const { container, getByText } = show(
      renderPreview({ kind: 'unresolved', title: 'My New Idea' })
    );

    expect(getByText('My New Idea')).toBeInTheDocument();
    expect(
      container.querySelector('.note-preview-card__empty')
    ).toHaveTextContent('Empty note');
    expect(container.querySelector('.note-page-canvas')).toBeNull();
    expect(getPage).not.toHaveBeenCalled();
    expect(getEffective).not.toHaveBeenCalled();
  });

  it('a link whose target was renamed (now unresolved) previews as an empty note under the old title', () => {
    const { renderPreview, getPage } = setup(
      fakePage({ name: 'My New Project' })
    );

    const { getByText, container } = show(
      renderPreview({ kind: 'unresolved', title: 'My Project' })
    );

    expect(getByText('My Project')).toBeInTheDocument();
    expect(container.querySelector('.note-preview-card__empty')).not.toBeNull();
    expect(getPage).not.toHaveBeenCalled();
  });

  it('renders nothing for a resolved id whose page no longer exists', () => {
    const { renderPreview } = setup(undefined);

    expect(renderPreview({ kind: 'resolved', pageId: 'gone' })).toBeNull();
  });
});
