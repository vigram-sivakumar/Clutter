import type { Vault } from '@core/vault/models/Vault';
import type { PageOperations } from '@core/application/page/PageOperations';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
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
 * Deliberately does NOT parse `isoDate` via `new Date(isoDate)` —
 * confirmed by reading `shared/helpers/time/helpers/toDate.ts`'s own
 * implementation that this is a real, pre-existing trap: passing a bare
 * `"YYYY-MM-DD"` string to the `Date` constructor is parsed as **UTC**
 * midnight per spec, while `DailyNotePath`'s own path-building reads back
 * via **local** getters (`getFullYear`/`getMonth`/`getDate`) — for any
 * negative-UTC-offset timezone, `new Date("2026-08-20")` is actually
 * "2026-08-19, evening, local time," which would silently open the
 * *wrong* Daily Note. `toLocalDate` below constructs the `Date` from its
 * numeric year/month/day components directly (`new Date(y, m - 1, d)`,
 * always local), the same safe construction `isValidCalendarDate` and
 * `DailyNotePath.parseCanonicalDate` already use.
 */
function toLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

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

      void pageOperations.openAtPath(DailyNotePath.absoluteFrom(vault.root, toLocalDate(isoDate)), {
        type: 'daily-note',
      });
    },
  });
}
