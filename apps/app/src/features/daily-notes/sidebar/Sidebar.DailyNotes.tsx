import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DailyNotesShortcuts } from '@features/daily-notes/shortcuts/DailyNotesShortcuts';
import type { Vault } from '@core/vault/models';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';

import { DailyNotesList } from './DailyNotesList';

interface DailyNotesPanelProps {
  vault: Vault;
  query: VaultQuery;
  workspace: Workspace;
  activeDate: string | undefined;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
  onStartToday(): void;
  onOpenDate(date: string): void;
}

export function DailyNotes({
  vault,
  query,
  workspace,
  activeDate,
  onOpen,
  onOpenFolder,
  onStartToday,
  onOpenDate,
}: DailyNotesPanelProps) {
  return (
    <View
      navigation={
        <DailyNotesShortcuts
          vault={vault}
          activeDate={activeDate}
          onStartToday={onStartToday}
          onOpenDate={onOpenDate}
        />
      }
    >
      <DailyNotesList
        vault={vault}
        query={query}
        workspace={workspace}
        onOpen={onOpen}
        onOpenFolder={onOpenFolder}
      />
    </View>
  );
}
