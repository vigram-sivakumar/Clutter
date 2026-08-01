import { describe, expect, it, vi } from 'vitest';
import { toResourcePageModel } from './toResourcePageModel';
import { DocumentSession } from '@core/engine/DocumentSession';
import { DocumentTransaction } from '@core/engine/DocumentTransaction';
import { PageBuilder } from '@core/vault/build/PageBuilder';
import type { Page } from '@core/vault/models/Page';

function buildPage(overrides: { description?: string; cover?: string } = {}): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: '/vault/Note.md',
      directoryPath: '/vault',
      frontmatter: {
        id: 'page-1',
        description: overrides.description,
        cover: overrides.cover,
      },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
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
    const session = new DocumentSession(page);

    const model = toResourcePageModel(page, session, vi.fn());

    expect(model.title).toBe(page.name);
    expect(model.description).toBe('A note');
    expect(model.markdown).toBe('Body');
    expect(model.coverImage).toBe('/vault/cover.png');
  });

  it('renders the session\'s in-memory revision, not just the Vault snapshot', () => {
    const page = buildPage();
    const session = new DocumentSession(page);
    session.commit(new DocumentTransaction('Edited body'));

    const model = toResourcePageModel(page, session, vi.fn());

    expect(model.markdown).toBe('Edited body');
  });

  it('updateMarkdown delegates to the onUpdateMarkdown callback with the page id', () => {
    const page = buildPage();
    const session = new DocumentSession(page);
    const onUpdateMarkdown = vi.fn();

    const model = toResourcePageModel(page, session, onUpdateMarkdown);
    model.updateMarkdown('New content');

    expect(onUpdateMarkdown).toHaveBeenCalledWith(page.id, 'New content');
  });

  it('updateDescription throws — not yet routed through the Application layer', () => {
    const page = buildPage();
    const session = new DocumentSession(page);

    const model = toResourcePageModel(page, session, vi.fn());

    expect(() => model.updateDescription('New description')).toThrow(
      'Not implemented'
    );
  });
});
