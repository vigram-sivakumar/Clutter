import { describe, expect, it } from 'vitest';
import { buildDailyNoteTopBarMenu } from './dailyNoteTopBarMenu.config';
import { PageBuilder } from '@core/vault/build/PageBuilder';
import type { Page } from '@core/vault/models/Page';

function buildPage(status: 'active' | 'archived'): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: '/vault/Daily Notes/2026-08-01.md',
      directoryPath: '/vault/Daily Notes',
      frontmatter: { id: 'page-1', type: 'daily-note', status },
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

describe('buildDailyNoteTopBarMenu', () => {
  it("includes 'archive', not 'restore', for an active page", () => {
    const menu = buildDailyNoteTopBarMenu(buildPage('active'));
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('archive');
    expect(ids).not.toContain('restore');
  });

  it("includes 'restore', not 'archive', for an archived page", () => {
    const menu = buildDailyNoteTopBarMenu(buildPage('archived'));
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('restore');
    expect(ids).not.toContain('archive');
  });

  it("includes 'delete' regardless of status", () => {
    expect(
      buildDailyNoteTopBarMenu(buildPage('active')).map((i) => i.id)
    ).toContain('delete');
    expect(
      buildDailyNoteTopBarMenu(buildPage('archived')).map((i) => i.id)
    ).toContain('delete');
  });
});
