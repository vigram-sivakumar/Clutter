import { useEffect } from 'react';

import type { Application } from '@core/application/Application';
import { discardLegacyAutoDeleteArchived, readLegacyCoverPosition } from '@shared/helpers/legacyAppSettings';

/**
 * Carries the two settings that used to be app-wide into the open Space, once per Space (policy: legacyAppSettings.ts).
 * Idempotent: it only ever fills in what the Space has not chosen, so running it on every open does nothing after
 * the first and can never overwrite a value the Space has. Automatic archive cleanup is not carried over at all.
 */
export function migrateLegacyAppSettings(application: Application): void {
  const legacyCoverPosition = readLegacyCoverPosition();

  if (legacyCoverPosition !== undefined && application.spaceProfile?.defaultCoverPosition === undefined) {
    void application.spaceProfileStore.setDefaultCoverPosition(legacyCoverPosition);
  }

  discardLegacyAutoDeleteArchived();
}

export function useSpaceSettingsMigration(application: Application): void {
  useEffect(() => {
    migrateLegacyAppSettings(application);
  }, [application]);
}
