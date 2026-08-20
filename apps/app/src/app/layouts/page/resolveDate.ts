import type { Vault } from '@core/vault/models/Vault';
import type { PageOperations } from '@core/application/page/PageOperations';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import type { ResolveDate } from '@features/markdown/editor/MarkdownEditor';

/**
 * Composes `Vault` + `PageOperations` into the editor's injected
 * `ResolveDate` boundary — the editor itself never imports either
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * Mirrors `resolveTag.ts`'s role, same reason it's this small: activation
 * is the only thing here that needs app-layer capabilities at all (see
 * `dateResolution.ts`'s own comment) — reuses the existing, already-shipped
 * `DailyNotePath.absoluteFrom` + `PageOperations.openAtPath(..., { type:
 * 'daily-note' })` flow verbatim (the same one `Sidebar.tsx`'s calendar
 * date-click already uses), not a new date-opening mechanism.
 *
 * `toDate` (shared/helpers/time) now parses `isoDate` via local
 * numeric-component construction rather than `new Date(isoString)`, so it's
 * safe to reuse directly here instead of keeping a private duplicate — the
 * previous UTC-midnight trap that could open the wrong Daily Note in a
 * negative-UTC-offset timezone is fixed at the shared helper.
 */
export function createDateResolver(vault: Vault, pageOperations: PageOperations): ResolveDate {
  return (isoDate) => ({
    activate: () => {
      // A calendar-invalid-but-shape-valid date (2026-13-45) never
      // navigates — `Date`'s own constructor silently rolls invalid
      // components over into a different, unrelated valid date rather
      // than throwing, which would otherwise open some nonsense Daily
      // Note with no connection to what the user actually typed.
      if (!isValidCalendarDate(isoDate)) {
        return;
      }

      void pageOperations.openAtPath(DailyNotePath.absoluteFrom(vault.root, toDate(isoDate)), {
        type: 'daily-note',
      });
    },
  });
}
