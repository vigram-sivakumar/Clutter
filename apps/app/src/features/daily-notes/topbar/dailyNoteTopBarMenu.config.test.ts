import { describe, expect, it } from 'vitest';
import { buildDailyNoteTopBarMenu } from './dailyNoteTopBarMenu.config';

describe('buildDailyNoteTopBarMenu', () => {
  it("includes 'archive', not 'restore', for an active page", () => {
    const menu = buildDailyNoteTopBarMenu('active');
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('archive');
    expect(ids).not.toContain('restore');
  });

  it("includes 'restore', not 'archive', for an archived page", () => {
    const menu = buildDailyNoteTopBarMenu('archived');
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('restore');
    expect(ids).not.toContain('archive');
  });

  it("omits 'delete' when isDeletable is false (or omitted) — an ordinary workspace daily note has no Delete entry point", () => {
    expect(buildDailyNoteTopBarMenu('active').map((i) => i.id)).not.toContain('delete');
    expect(buildDailyNoteTopBarMenu('active', false).map((i) => i.id)).not.toContain('delete');
  });

  it("includes 'delete' when isDeletable is true, regardless of status", () => {
    expect(buildDailyNoteTopBarMenu('active', true).map((i) => i.id)).toContain('delete');
    expect(buildDailyNoteTopBarMenu('archived', true).map((i) => i.id)).toContain('delete');
  });

  it("enabled 'archive'/'delete', not disabled, for a persisted (active) page", () => {
    const menu = buildDailyNoteTopBarMenu('active', true);

    expect(menu.find((i) => i.id === 'archive')?.disabled).toBeFalsy();
    expect(menu.find((i) => i.id === 'delete')?.disabled).toBeFalsy();
  });

  it("includes 'archive', not 'restore', for a draft, and disables both it and 'delete' when shown", () => {
    const menu = buildDailyNoteTopBarMenu('draft', true);
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('archive');
    expect(ids).not.toContain('restore');
    expect(menu.find((i) => i.id === 'archive')?.disabled).toBe(true);
    expect(menu.find((i) => i.id === 'delete')?.disabled).toBe(true);
  });

  it("never includes 'move-to' — Daily Notes are entirely outside the Move feature", () => {
    expect(buildDailyNoteTopBarMenu('active').map((i) => i.id)).not.toContain('move-to');
    expect(buildDailyNoteTopBarMenu('archived').map((i) => i.id)).not.toContain('move-to');
    expect(buildDailyNoteTopBarMenu('draft').map((i) => i.id)).not.toContain('move-to');
  });

  // ADR-017's second amendment (Cover Image milestone): unlike archive/
  // delete, 'add-cover-image' is never disabled for a draft — a genuine
  // cover commit promotes a Daily Note draft the same way a body commit
  // already does (PageOperations.updateMetadata()).
  it("includes 'add-cover-image', enabled, for every state including a draft", () => {
    for (const state of ['active', 'archived', 'draft'] as const) {
      const item = buildDailyNoteTopBarMenu(state).find(
        (i) => i.id === 'add-cover-image'
      );
      expect(item).toBeDefined();
      expect(item?.disabled).toBeFalsy();
    }
  });

  it("includes an enabled 'reveal-in-finder' and 'copy-path' (with As Markdown) for a persisted, active daily note", () => {
    const menu = buildDailyNoteTopBarMenu('active');

    expect(menu.find((i) => i.id === 'reveal-in-finder')?.disabled).toBeFalsy();
    const copyPath = menu.find((i) => i.id === 'copy-path');
    expect(copyPath?.disabled).toBeFalsy();
    expect(copyPath?.submenu?.map((leaf) => leaf.id)).toContain('copy-path-as-markdown');
  });

  it("disables (not omits) 'reveal-in-finder'/'copy-path' for a draft, like add-cover-image is NOT — no path exists yet", () => {
    const menu = buildDailyNoteTopBarMenu('draft');
    const ids = menu.map((i) => i.id);

    expect(ids).toContain('reveal-in-finder');
    expect(ids).toContain('copy-path');
    expect(menu.find((i) => i.id === 'reveal-in-finder')?.disabled).toBe(true);
    expect(menu.find((i) => i.id === 'copy-path')?.disabled).toBe(true);
  });
});
