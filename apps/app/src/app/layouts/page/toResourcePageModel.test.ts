import { describe, expect, it, vi } from 'vitest';
import { toResourcePageModel, toDraftPageModel } from './toResourcePageModel';
import { DocumentSession } from '@core/engine/DocumentSession';
import { DocumentTransaction } from '@core/engine/DocumentTransaction';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import type { Page } from '@core/vault/models/Page';
import { formatDateDisplay } from '@shared/helpers/time';

function buildPage(overrides: {
  path?: string;
  description?: string;
  cover?: string;
  content?: string;
} = {}): Page {
  return new PageBuilder('/vault').build({
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

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn(), vi.fn());

    expect(model.title).toBe(page.name);
    expect(model.description).toBe('A note');
    expect(model.markdown).toBe('Body');
    expect(model.coverImage).toBe('/vault/cover.png');
  });

  it('renders the session\'s in-memory revision, not just the Vault snapshot', () => {
    const page = buildPage();
    const session = new DocumentSession(page.id, page.source.markdown);
    session.commit(new DocumentTransaction('Edited body'));

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn(), vi.fn());

    expect(model.markdown).toBe('Edited body');
  });

  it('updateMarkdown delegates to the onUpdateMarkdown callback with the page id', () => {
    const page = buildPage();
    const session = new DocumentSession(page.id, page.source.markdown);
    const onUpdateMarkdown = vi.fn();

    const model = toResourcePageModel(page, session, onUpdateMarkdown, vi.fn(), vi.fn());
    model.updateMarkdown('New content');

    expect(onUpdateMarkdown).toHaveBeenCalledWith(page.id, 'New content');
  });

  it('requestSave delegates to the onRequestSave callback with the page id, no payload', () => {
    const page = buildPage();
    const session = new DocumentSession(page.id, page.source.markdown);
    const onRequestSave = vi.fn();

    const model = toResourcePageModel(page, session, vi.fn(), onRequestSave, vi.fn());
    model.requestSave();

    expect(onRequestSave).toHaveBeenCalledWith(page.id);
    expect(onRequestSave).toHaveBeenCalledTimes(1);
  });

  it('shows an empty title (not body content) for a note with an auto-generated name — the header is an editing surface, not a preview', () => {
    const page = buildPage({
      path: '/vault/Untitled 2.md',
      content: 'Real content here',
    });
    const session = new DocumentSession(page.id, page.source.markdown);

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn(), vi.fn());

    expect(model.title).toBe('');
  });

  it('always shows the real filename for a daily note, even one with an auto-generated-looking name — its identity is always the date, never a placeholder', () => {
    // Built as a Page literal, not via PageBuilder: a real Daily Note's
    // name is always the canonical Daily Note date (DailyNotePath's
    // convention is now enforced at classification time — see
    // PageBuilder's "type is derived from canonical path" tests), so this
    // specific name/type combination can no longer occur through normal
    // ingest. toResourcePageModel's own type-aware fallback rule is what's
    // under test here, independent of how the Page came to exist.
    const page: Page = {
      id: 'daily-1',
      type: 'daily-note',
      name: 'Untitled',
      path: '/vault/Daily Notes/2026/August/Untitled.md',
      parentId: null,
      metadata: {
        icon: null,
        cover: null,
        description: null,
        favorite: false,
        status: 'active',
        archivedAt: null,
        originalParentId: null,
        originalPath: null,
        createdAt: null,
        updatedAt: null,
      },
      source: { markdown: 'Hello world I am here' },
      analysis: {
        headings: [],
        aliases: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    };
    const session = new DocumentSession(page.id, page.source.markdown);

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn(), vi.fn());

    expect(model.title).toBe('Untitled');
    expect(model.title).toBe(page.name);
  });

  it("formats a real Daily Note's title through the shared full-date formatter, not the raw ISO filename", () => {
    const page: Page = {
      id: 'daily-2',
      type: 'daily-note',
      name: '2026-08-20',
      path: '/vault/Daily Notes/2026/August/2026-08-20.md',
      parentId: null,
      metadata: {
        icon: null,
        cover: null,
        description: null,
        favorite: false,
        status: 'active',
        archivedAt: null,
        originalParentId: null,
        originalPath: null,
        createdAt: null,
        updatedAt: null,
      },
      source: { markdown: '' },
      analysis: {
        headings: [],
        aliases: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    };
    const session = new DocumentSession(page.id, page.source.markdown);

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn(), vi.fn());

    expect(model.title).toBe(formatDateDisplay('2026-08-20', 'full'));
    expect(model.title).not.toBe(page.name);
  });

  it('updateDescription delegates to the onUpdateDescription callback with the page id', () => {
    const page = buildPage();
    const session = new DocumentSession(page.id, page.source.markdown);
    const onUpdateDescription = vi.fn();

    const model = toResourcePageModel(page, session, vi.fn(), vi.fn(), onUpdateDescription);
    model.updateDescription('New description');

    expect(onUpdateDescription).toHaveBeenCalledWith(page.id, 'New description');
  });
});

describe('toDraftPageModel (ADR-017)', () => {
  it('derives title from the draft descriptor, defaulting to empty (a placeholder, not filled-in text), and has no description/cover', () => {
    const session = new DocumentSession('draft-1', '');

    expect(
      toDraftPageModel('draft-1', 'note', 'My Draft', session, vi.fn(), vi.fn()).title
    ).toBe('My Draft');
    expect(
      toDraftPageModel('draft-1', 'note', undefined, session, vi.fn(), vi.fn()).title
    ).toBe('');
    expect(
      toDraftPageModel('draft-1', 'note', 'My Draft', session, vi.fn(), vi.fn()).description
    ).toBe('');
    expect(
      toDraftPageModel('draft-1', 'note', 'My Draft', session, vi.fn(), vi.fn()).coverImage
    ).toBe(null);
  });

  it('formats a daily-note draft\'s title through the shared full-date formatter, same as a persisted Daily Note', () => {
    // formatDailyNoteTitle (toResourcePageModel.ts) calls formatDateDisplay
    // with no explicit reference date, so it always resolves against the
    // real clock (same as DateWidget/formatTaskDueDate elsewhere) — the
    // clock is pinned here so this test's own expected-value computation
    // (also via the real Date, no reference passed) stays in sync with it
    // regardless of which day this test actually runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20)); // Thursday, 2026-08-20

    const session = new DocumentSession('draft-1', '');

    const model = toDraftPageModel('draft-1', 'daily-note', '2026-08-20', session, vi.fn(), vi.fn());

    expect(model.title).toBe(formatDateDisplay('2026-08-20', 'full'));

    vi.useRealTimers();
  });

  it("renders the session's in-memory revision", () => {
    const session = new DocumentSession('draft-1', '');
    session.commit(new DocumentTransaction('Typed content'));

    const model = toDraftPageModel('draft-1', 'note', 'My Draft', session, vi.fn(), vi.fn());

    expect(model.markdown).toBe('Typed content');
  });

  it('updateMarkdown delegates to onUpdateMarkdown with the draft id', () => {
    const session = new DocumentSession('draft-1', '');
    const onUpdateMarkdown = vi.fn();

    toDraftPageModel(
      'draft-1',
      'note',
      'My Draft',
      session,
      onUpdateMarkdown,
      vi.fn()
    ).updateMarkdown('New content');

    expect(onUpdateMarkdown).toHaveBeenCalledWith('draft-1', 'New content');
  });

  it('requestSave delegates to onRequestSave with the draft id, no payload', () => {
    const session = new DocumentSession('draft-1', '');
    const onRequestSave = vi.fn();

    toDraftPageModel('draft-1', 'note', 'My Draft', session, vi.fn(), onRequestSave).requestSave();

    expect(onRequestSave).toHaveBeenCalledWith('draft-1');
    expect(onRequestSave).toHaveBeenCalledTimes(1);
  });
});
