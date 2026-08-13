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

  it("includes 'delete' regardless of status", () => {
    expect(buildDailyNoteTopBarMenu('active').map((i) => i.id)).toContain('delete');
    expect(buildDailyNoteTopBarMenu('archived').map((i) => i.id)).toContain('delete');
  });

  it("enabled 'archive'/'delete', not disabled, for a persisted (active) page", () => {
    const menu = buildDailyNoteTopBarMenu('active');

    expect(menu.find((i) => i.id === 'archive')?.disabled).toBeFalsy();
    expect(menu.find((i) => i.id === 'delete')?.disabled).toBeFalsy();
  });

  it("includes 'archive', not 'restore', for a draft, and disables both it and 'delete'", () => {
    const menu = buildDailyNoteTopBarMenu('draft');
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
});
