import type { Vault } from '@core/vault/models/Vault';
import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * The ISO date of the active Daily Note, or undefined when the active
 * page (real or draft) isn't a Daily Note. This is the calendar's only
 * source of "which date is selected" — it never keeps its own copy of
 * this (single source of truth is the active page, not the calendar
 * widget). Covers both a persisted Daily Note (its `name` is already the
 * ISO date, per DailyNotePath's filename convention) and an unpersisted
 * Daily Note draft (ADR-017 — its title is derived the same way by
 * PageOperations.openAtPath).
 */
export function getActiveDailyNoteDate(
  vault: Pick<Vault, 'getPage'>,
  activePageId: string | null,
  pageOperations: Pick<PageOperations, 'getDraft'>
): string | undefined {
  if (!activePageId) {
    return undefined;
  }

  const page = vault.getPage(activePageId);

  if (page) {
    return page.type === 'daily-note' ? page.name : undefined;
  }

  const draft = pageOperations.getDraft(activePageId);

  return draft?.type === 'daily-note' ? draft.title : undefined;
}
