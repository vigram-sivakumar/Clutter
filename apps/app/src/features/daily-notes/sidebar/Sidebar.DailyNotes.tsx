import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DailyNotesShortcuts } from '@features/daily-notes/shortcuts/DailyNotesShortcuts';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';

import { DailyNotesList } from './DailyNotesList';

interface DailyNotesPanelProps {
  vault: Vault;
  workspace: Workspace;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
}

export function DailyNotes({
  vault,
  workspace,
  onOpen,
  onOpenFolder,
}: DailyNotesPanelProps) {
  return (
    <View navigation={<DailyNotesShortcuts vault={vault} />}>
      <DailyNotesList
        vault={vault}
        workspace={workspace}
        onOpen={onOpen}
        onOpenFolder={onOpenFolder}
      />
    </View>
  );
}
