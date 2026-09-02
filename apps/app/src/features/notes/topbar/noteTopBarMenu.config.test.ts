import { describe, expect, it } from 'vitest';
import { buildNoteTopBarMenu } from './noteTopBarMenu.config';

describe('buildNoteTopBarMenu', () => {
  it("includes 'archive', not 'restore', for an active page", () => {
    const menu = buildNoteTopBarMenu('active');
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('archive');
    expect(ids).not.toContain('restore');
  });

  it("includes 'restore', not 'archive', for an archived page", () => {
    const menu = buildNoteTopBarMenu('archived');
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('restore');
    expect(ids).not.toContain('archive');
  });

  it("omits 'delete' when isDeletable is false (or omitted) — an ordinary workspace note has no Delete entry point", () => {
    expect(buildNoteTopBarMenu('active').map((i) => i.id)).not.toContain('delete');
    expect(buildNoteTopBarMenu('active', false, false).map((i) => i.id)).not.toContain(
      'delete'
    );
  });

  it("includes 'delete' when isDeletable is true, regardless of status", () => {
    expect(buildNoteTopBarMenu('active', false, true).map((i) => i.id)).toContain('delete');
    expect(buildNoteTopBarMenu('archived', false, true).map((i) => i.id)).toContain('delete');
  });

  it("enabled 'archive'/'delete', not disabled, for a persisted (active) page", () => {
    const menu = buildNoteTopBarMenu('active', false, true);

    expect(menu.find((i) => i.id === 'archive')?.disabled).toBeFalsy();
    expect(menu.find((i) => i.id === 'delete')?.disabled).toBeFalsy();
  });

  it("includes 'archive', not 'restore', for a draft, and disables both it and 'delete' when shown", () => {
    const menu = buildNoteTopBarMenu('draft', false, true);
    const ids = menu.map((item) => item.id);

    expect(ids).toContain('archive');
    expect(ids).not.toContain('restore');
    expect(menu.find((i) => i.id === 'archive')?.disabled).toBe(true);
    expect(menu.find((i) => i.id === 'delete')?.disabled).toBe(true);
  });

  it("never includes 'delete' for a draft when isDeletable is false — a draft has no Vault entry to be archived", () => {
    const menu = buildNoteTopBarMenu('draft');

    expect(menu.map((i) => i.id)).not.toContain('delete');
  });

  it("includes an enabled 'move-to' for a persisted, active page", () => {
    const menu = buildNoteTopBarMenu('active');

    expect(menu.find((i) => i.id === 'move-to')?.disabled).toBeFalsy();
  });

  it("disables 'move-to' for a draft", () => {
    const menu = buildNoteTopBarMenu('draft');

    expect(menu.find((i) => i.id === 'move-to')?.disabled).toBe(true);
  });

  it("disables 'move-to' for an archived page", () => {
    const menu = buildNoteTopBarMenu('archived');

    expect(menu.find((i) => i.id === 'move-to')?.disabled).toBe(true);
  });

  it("labels 'toggle-favorite' as 'Add to Favorites' when isFavorite is false (or omitted)", () => {
    const menu = buildNoteTopBarMenu('active', false);

    expect(menu.find((i) => i.id === 'toggle-favorite')?.label).toBe('Add to Favorites');
    expect(buildNoteTopBarMenu('active').find((i) => i.id === 'toggle-favorite')?.label).toBe(
      'Add to Favorites'
    );
  });

  it("labels 'toggle-favorite' as 'Remove from Favorites' when isFavorite is true", () => {
    const menu = buildNoteTopBarMenu('active', true);

    expect(menu.find((i) => i.id === 'toggle-favorite')?.label).toBe('Remove from Favorites');
  });
});
