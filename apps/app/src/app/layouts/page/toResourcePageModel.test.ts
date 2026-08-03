import { describe, expect, it, vi } from 'vitest';
import { toResourcePageModel, toDraftPageModel } from './toResourcePageModel';
import { DocumentSession } from '@core/engine/DocumentSession';
import { DocumentTransaction } from '@core/engine/DocumentTransaction';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import type { Page } from '@core/vault/models/Page';

function buildPage(overrides: {
  path?: string;
  description?: string;
  cover?: string;
  content?: string;
} = {}): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: overrides.path ?? '/vault/Note.md',
      directoryPath: '/vault',
      frontmatter: {
        id: 'page-1',
        description: overrides.description,
        cover: overrides.cover,
      },
      frontmatterAnalysis: { aliases: [] },
      content: overrides.content ?? 'Body',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

describe('toResourcePageModel', () => {
  it('derives title, description, markdown, and coverImage from the page and session', () => {
    const page = buildPage({ description: 'A note', cover: '/vault/cover.png' });
    const session = new DocumentSession(page.id, page.source.markdown);

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn());

    expect(model.title).toBe(page.name);
    expect(model.description).toBe('A note');
    expect(model.markdown).toBe('Body');
    expect(model.coverImage).toBe('/vault/cover.png');
  });

  it('renders the session\'s in-memory revision, not just the Vault snapshot', () => {
    const page = buildPage();
    const session = new DocumentSession(page.id, page.source.markdown);
    session.commit(new DocumentTransaction('Edited body'));

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn());

    expect(model.markdown).toBe('Edited body');
  });

  it('updateMarkdown delegates to the onUpdateMarkdown callback with the page id', () => {
    const page = buildPage();
    const session = new DocumentSession(page.id, page.source.markdown);
    const onUpdateMarkdown = vi.fn();

    const model = toResourcePageModel(page, session, onUpdateMarkdown, vi.fn());
    model.updateMarkdown('New content');

    expect(onUpdateMarkdown).toHaveBeenCalledWith(page.id, 'New content');
  });

  it('shows an empty title (not body content) for a note with an auto-generated name — the header is an editing surface, not a preview', () => {
    const page = buildPage({
      path: '/vault/Untitled 2.md',
      content: 'Real content here',
    });
    const session = new DocumentSession(page.id, page.source.markdown);

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn());

    expect(model.title).toBe('');
  });

  it('always shows the real filename for a daily note, even one with an auto-generated-looking name — its identity is always the date, never a placeholder', () => {
    const page = new PageBuilder().build({
      parentId: null,
      page: {
        path: '/vault/Daily Notes/2026/08/Untitled.md',
        directoryPath: '/vault/Daily Notes/2026/08',
        frontmatter: { id: 'daily-1', type: 'daily-note' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Hello world I am here',
        analysis: {
          headings: [],
          blockReferences: [],
          tasks: [],
          tags: [],
          links: [],
          embeds: [],
        },
      },
    });
    const session = new DocumentSession(page.id, page.source.markdown);

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn());

    expect(model.title).toBe('Untitled');
    expect(model.title).toBe(page.name);
  });

  it('updateDescription delegates to the onUpdateDescription callback with the page id', () => {
    const page = buildPage();
    const session = new DocumentSession(page.id, page.source.markdown);
    const onUpdateDescription = vi.fn();

    const model = toResourcePageModel(page, session, vi.fn(), onUpdateDescription);
    model.updateDescription('New description');

    expect(onUpdateDescription).toHaveBeenCalledWith(page.id, 'New description');
  });
});

describe('toDraftPageModel (ADR-017)', () => {
  it('derives title from the draft descriptor, defaulting to empty (a placeholder, not filled-in text), and has no description/cover', () => {
    const session = new DocumentSession('draft-1', '');

    expect(toDraftPageModel('draft-1', 'My Draft', session, vi.fn()).title).toBe(
      'My Draft'
    );
    expect(toDraftPageModel('draft-1', undefined, session, vi.fn()).title).toBe('');
    expect(toDraftPageModel('draft-1', 'My Draft', session, vi.fn()).description).toBe(
      ''
    );
    expect(toDraftPageModel('draft-1', 'My Draft', session, vi.fn()).coverImage).toBe(
      null
    );
  });

  it("renders the session's in-memory revision", () => {
    const session = new DocumentSession('draft-1', '');
    session.commit(new DocumentTransaction('Typed content'));

    const model = toDraftPageModel('draft-1', 'My Draft', session, vi.fn());

    expect(model.markdown).toBe('Typed content');
  });

  it('updateMarkdown delegates to onUpdateMarkdown with the draft id', () => {
    const session = new DocumentSession('draft-1', '');
    const onUpdateMarkdown = vi.fn();

    toDraftPageModel('draft-1', 'My Draft', session, onUpdateMarkdown).updateMarkdown(
      'New content'
    );

    expect(onUpdateMarkdown).toHaveBeenCalledWith('draft-1', 'New content');
  });
});
