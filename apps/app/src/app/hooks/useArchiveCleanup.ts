import { useEffect } from 'react';

import type { Application } from '@core/application/Application';

/** How often the cleanup looks again while the app stays open. The rule itself counts calendar days, so hourly is plenty. */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Runs the archive cleanup (`Application.runArchiveCleanupIfEnabled`) for the open Space: once when it opens, when
 * the Space's setting is turned on, and every hour after. Whether this Space has the setting on is the
 * Application's own question on every run, so while it is off nothing runs and turning it off stops the next run
 * with nothing to cancel. Bound to this one `application`: when the Space changes, the layout unmounts, this stops,
 * and the new Space gets its own. Silent by design: no dialog, no toast.
 */
export function useArchiveCleanup(application: Application): void {
  useEffect(() => {
    let active = true;

    const run = () => {
      if (active) {
        void application.runArchiveCleanupIfEnabled(new Date());
      }
    };

    run();
    const unsubscribe = application.spaceProfileStore.subscribe(run);
    const timer = setInterval(run, CLEANUP_INTERVAL_MS);

    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [application]);
}
