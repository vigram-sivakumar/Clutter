import { Button } from '@components/button/Button';
import { MONTH_LABELS } from '@shared/helpers/time/dateDisplay';
import { AppIcon } from '@shared/icon';
import './ArchivedBannerNew.css';

/**
 * `08 October 2026` for a recorded archive instant (`archivedAt`), in the local calendar day. Absent
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

  return `${String(date.getDate()).padStart(2, '0')} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}

interface ArchivedBannerNewProps {
  /** The resource's recorded `archivedAt`; null for one archived only by where it sits. */
  readonly archivedAt: string | null | undefined;
  /** Omitted when the resource isn't restorable itself (archived along with a folder above it). */
  readonly onRestore?: () => void;
}

/** The top bar's notice on an effectively archived Note, Daily Note or Folder. */
export function ArchivedBannerNew({
  archivedAt,
  onRestore,
}: ArchivedBannerNewProps) {
  const archivedDate = formatArchivedDate(archivedAt);

  return (
    <div className="archived-banner">
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
