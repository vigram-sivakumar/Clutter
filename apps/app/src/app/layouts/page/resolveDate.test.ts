import { describe, expect, it, vi } from 'vitest';

import type { Vault } from '@core/vault/models/Vault';
import type { PageOperations } from '@core/application/page/PageOperations';

import { createDateResolver } from './resolveDate';

const ROOT = '/vault';

function fakeVault(): Vault {
  return { root: ROOT, getPageByPath: () => undefined, findArchivedPageByOrigin: () => ({ status: 'none' }) } as unknown as Vault;
}

function fakePageOperations(openAtPath: (path: string, options: { type: string }) => void): PageOperations {
  return {
    openAtPath: (path: string, options: { type: string }) => {
      openAtPath(path, options);
      return Promise.resolve();
    },
  } as unknown as PageOperations;
}

describe('createDateResolver', () => {
  it('activate opens the canonical Daily Note path for the resolved date', () => {
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(fakeVault(), fakePageOperations(openAtPath));

    resolveDate('2026-08-20').activate();

    expect(openAtPath).toHaveBeenCalledWith(`${ROOT}/Daily Notes/2026/August/2026-08-20.md`, {
      type: 'daily-note',
    });
  });

  it('activate is a no-op for a calendar-invalid (but shape-valid) date — never opens a rolled-over, unrelated Daily Note', () => {
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(fakeVault(), fakePageOperations(openAtPath));

    resolveDate('2026-13-45').activate();

    expect(openAtPath).not.toHaveBeenCalled();
  });

  it('resolves the correct local calendar day regardless of the host UTC offset — never parses via new Date(isoDate) directly', () => {
    // The regression this guards: new Date("2026-01-01") is parsed as UTC
    // midnight, which is Dec 31 in any negative-UTC-offset timezone. If
    // createDateResolver ever regressed to that parsing, this path would
    // silently become .../2025/December/2025-12-31.md instead.
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(fakeVault(), fakePageOperations(openAtPath));

    resolveDate('2026-01-01').activate();

    expect(openAtPath).toHaveBeenCalledWith(`${ROOT}/Daily Notes/2026/January/2026-01-01.md`, {
      type: 'daily-note',
    });
  });
});

describe('createDateResolver in a read-only host (createMissing: false) — an archived note', () => {
  const vaultWith = (existingPaths: string[]): Vault =>
    ({
      root: ROOT,
      getPageByPath: (path: string) => (existingPaths.includes(path) ? { id: 'daily' } : undefined),
      findArchivedPageByOrigin: () => ({ status: 'none' }),
    }) as unknown as Vault;
  const PATH = `${ROOT}/Daily Notes/2026/August/2026-08-20.md`;

  it('a date whose Daily Note does not exist opens nothing — no draft', () => {
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(vaultWith([]), fakePageOperations(openAtPath), { createMissing: false });

    resolveDate('2026-08-20').activate();

    expect(openAtPath).not.toHaveBeenCalled();
  });

  it('a date whose Daily Note exists still opens it', () => {
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(vaultWith([PATH]), fakePageOperations(openAtPath), { createMissing: false });

    resolveDate('2026-08-20').activate();

    expect(openAtPath).toHaveBeenCalledWith(PATH, { type: 'daily-note' });
  });

  it('the default still opens or drafts a missing one', () => {
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(vaultWith([]), fakePageOperations(openAtPath));

    resolveDate('2026-08-20').activate();

    expect(openAtPath).toHaveBeenCalledWith(PATH, { type: 'daily-note' });
  });
});

describe('createDateResolver: a day whose note was archived', () => {
  const vaultWith = (lookup: unknown): Vault =>
    ({ root: ROOT, getPageByPath: () => undefined, findArchivedPageByOrigin: () => lookup }) as unknown as Vault;
  const operations = (open: (id: string) => void, openAtPath: (path: string) => void) =>
    ({
      open: (id: string) => {
        open(id);
        return Promise.resolve();
      },
      openAtPath: (path: string) => {
        openAtPath(path);
        return Promise.resolve('draft');
      },
    }) as unknown as PageOperations;

  it('opens the archived note itself, and drafts no second note for the day', () => {
    const open = vi.fn();
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(vaultWith({ status: 'unique', item: { id: 'archived-daily' } }), operations(open, openAtPath));

    resolveDate('2026-08-20').activate();

    expect(open).toHaveBeenCalledWith('archived-daily');
    expect(openAtPath).not.toHaveBeenCalled();
  });

  it('does nothing when several archived notes claim the day (never guesses, never drafts)', () => {
    const open = vi.fn();
    const openAtPath = vi.fn();
    const resolveDate = createDateResolver(vaultWith({ status: 'ambiguous' }), operations(open, openAtPath));

    resolveDate('2026-08-20').activate();

    expect(open).not.toHaveBeenCalled();
    expect(openAtPath).not.toHaveBeenCalled();
  });
});
