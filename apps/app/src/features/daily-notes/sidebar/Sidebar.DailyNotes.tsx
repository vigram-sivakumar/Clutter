import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DailyNotesShortcuts } from '@features/daily-notes/shortcuts/DailyNotesShortcuts';
import { renderDailyNotesByMonth } from '../helpers/renderDailyNotesByMonth';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';

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
  const dailyNotes = Array.from(vault.dailyNotes());

  return (
    <View navigation={<DailyNotesShortcuts vault={vault} />}>
      {renderDailyNotesByMonth({
        dailyNotes,
        workspace,
        onOpen,
        onOpenFolder,
      })}
    </View>
  );
}
