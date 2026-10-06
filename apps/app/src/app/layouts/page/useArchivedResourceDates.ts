import { useEffect, useState } from 'react';

import type { Application } from '@core/application/Application';

/**
 * When each archived file was archived, by its path in the Archive — read from the archive record
 * (`.clutter/resource-archive.json`) the Persistence Gate writes at the moment the app archives a
 * file. Empty until the read finishes and for a file with no recorded date. Re-read whenever the set
 * of archived paths changes (a file archived, restored or renamed), so the page never shows a stale
 * date. Reading only: this never writes the record.
 */
export function useArchivedResourceDates(
  application: Application,
  archivedPaths: readonly string[],
  enabled: boolean
): ReadonlyMap<string, string> {
  const [dates, setDates] = useState<ReadonlyMap<string, string>>(() => new Map());
  const key = archivedPaths.join('\n');

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    void application.resourceArchiveStore
      .read()
      .then((entries) => {
        if (cancelled) {
          return;
        }

        const next = new Map<string, string>();
        for (const [path, entry] of entries) {
          if (entry.archivedAt) {
            next.set(path, entry.archivedAt);
          }
        }
        setDates(next);
      })
      // An unreadable record just means no dates: the Archive still lists every file.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [application, key, enabled]);

  return dates;
}
