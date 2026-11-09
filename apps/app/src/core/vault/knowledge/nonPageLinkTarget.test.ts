import { describe, expect, it } from 'vitest';

import { ASSETS_DIRECTORY_NAME } from '@core/vault/initialize/ensureAssetsDirectory';
import { RESERVED_FOLDER_IDS } from '@core/vault/initialize/ReservedResources';

import { LINKABLE_SYSTEM_FOLDERS } from './nonPageLinkTarget';

describe('LINKABLE_SYSTEM_FOLDERS', () => {
  it('names exactly Inbox, Templates, Archive and Assets, each matching the definition it stands for', () => {
    expect(LINKABLE_SYSTEM_FOLDERS).toEqual([
      { id: 'inbox', name: RESERVED_FOLDER_IDS.inbox },
      { id: 'templates', name: RESERVED_FOLDER_IDS.templates },
      { id: 'archive', name: RESERVED_FOLDER_IDS.archive },
      { id: 'assets', name: ASSETS_DIRECTORY_NAME },
    ]);
  });

  it('never includes Daily Notes or .clutter', () => {
    const names: string[] = LINKABLE_SYSTEM_FOLDERS.map((entry) => entry.name);
    expect(names).not.toContain(RESERVED_FOLDER_IDS['daily-notes']);
    expect(names).not.toContain(RESERVED_FOLDER_IDS.clutter);
  });
});
