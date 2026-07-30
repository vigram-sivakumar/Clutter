import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DailyNotesNavigation } from '@features/daily-notes/navigation/DailyNotesNavigation';
import { renderDailyNotesByMonth } from '../helpers/renderDailyNotesByMonth';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';

interface DailyNotesPanelProps {
  vault: Vault;
  workspace: Workspace;
  onOpen(pageId: string): void;
}

export function DailyNotes({ vault, workspace, onOpen }: DailyNotesPanelProps) {
  const dailyNotes = Array.from(vault.dailyNotes());

  return (
    <View navigation={<DailyNotesNavigation vault={vault} />}>
      {renderDailyNotesByMonth({
        dailyNotes,
        workspace,
        onOpen,
      })}
    </View>
  );
}
