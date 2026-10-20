import { Button } from '@components/button/Button';
import { formatAbsoluteDate } from '@shared/helpers/time/dateDisplay';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { AppIcon } from '@shared/icon';
import './ArchivedBanner.css';

/**
 * `8 October 2026` for a recorded archive instant (`archivedAt`), in the local calendar day. Absent
 * or unparseable → `undefined`: a date is never invented for something archived only by location.
 */
export function formatArchivedDate(
  archivedAt: string | null | undefined
): string | undefined {
  if (!archivedAt) {
    return undefined;
  }

  const date = new Date(archivedAt);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  // The local calendar day of the recorded instant.
  return formatAbsoluteDate(toISODate(date));
}

interface ArchivedBannerProps {
  /** The resource's recorded `archivedAt`; null for one archived only by where it sits. */
  readonly archivedAt: string | null | undefined;
  /** Omitted when the resource isn't restorable itself (archived along with a folder above it). */
  readonly onRestore?: () => void;
  /** Inset for a top cover; full-width for a right-side cover or no cover. */
  readonly variant?: 'inset' | 'full-width';
}

/** The archived-state notice on an effectively archived Note, Daily Note or Folder. */
export function ArchivedBanner({
  archivedAt,
  onRestore,
  variant = 'full-width',
}: ArchivedBannerProps) {
  const archivedDate = formatArchivedDate(archivedAt);

  return (
    <div className={`archived-banner archived-banner--${variant}`}>
      <span className="archived-banner__message">
        {archivedDate
          ? `This has been archived on ${archivedDate}`
          : 'This has been archived'}
      </span>

      {onRestore && (
        <Button
          className="archived-banner__button"
          size="small"
          variant="outline"
          leading={<AppIcon icon="arrowDownRight" />}
          onClick={onRestore}
        >
          Restore
        </Button>
      )}
    </div>
  );
}
