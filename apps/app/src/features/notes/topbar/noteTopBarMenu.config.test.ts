import { describe, expect, it } from 'vitest';
import { buildNoteTopBarMenu } from './noteTopBarMenu.config';
import { PageBuilder } from '@core/vault/build/PageBuilder';
import type { Page } from '@core/vault/models/Page';

function buildPage(status: 'active' | 'archived'): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: '/vault/Note.md',
      directoryPath: '/vault',
      frontmatter: { id: 'page-1', status },
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

describe('buildNoteTopBarMenu', () => {
  it("includes 'archive', not 'restore', for an active page", () => {
    const menu = buildNoteTopBarMenu(buildPage('active'));
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('archive');
    expect(ids).not.toContain('restore');
  });

  it("includes 'restore', not 'archive', for an archived page", () => {
    const menu = buildNoteTopBarMenu(buildPage('archived'));
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('restore');
    expect(ids).not.toContain('archive');
  });

  it("includes 'delete' regardless of status", () => {
    expect(buildNoteTopBarMenu(buildPage('active')).map((i) => i.id)).toContain(
      'delete'
    );
    expect(buildNoteTopBarMenu(buildPage('archived')).map((i) => i.id)).toContain(
      'delete'
    );
  });
});
