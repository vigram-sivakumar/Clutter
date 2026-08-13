import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DailyNotesShortcuts } from '@features/daily-notes/shortcuts/DailyNotesShortcuts';
import type { Vault } from '@core/vault/models';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

import { DailyNotesList, type DailyNoteRowActions } from './DailyNotesList';

interface DailyNotesPanelProps {
  vault: Vault;
  query: VaultQuery;
  membershipSelector: MembershipSelector;
  workspace: Workspace;
  pageOperations: PageOperations;
  activeDate: string | undefined;
  onOpen(pageId: string): void;
  onOpenDraft(pageId: string): void;
  onOpenDate(date: string): void;
}

export function DailyNotes({
  vault,
  query,
  membershipSelector,
  workspace,
  pageOperations,
  activeDate,
  onOpen,
  onOpenDraft,
  onOpenDate,
}: DailyNotesPanelProps) {
  // Single owner of "which row's overflow menu is open" — same pattern and
  // same reason as Sidebar.Notes.tsx's rowActions: shared across every row
  // in this tab so only one menu is ever open at a time.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const rowActions: DailyNoteRowActions = {
    openMenuId,
    onOpenMenu: (id) => setOpenMenuId(id),
    onCloseMenu: () => setOpenMenuId(null),

    onArchiveNote: (pageId) => void pageOperations.archive(pageId),
    onDeleteNote: (pageId) => void pageOperations.delete(pageId),
    onToggleFavoriteNote: (pageId, isFavorite) =>
      void pageOperations.updateMetadata(pageId, { favorite: !isFavorite }),
  };

  return (
    <View
      navigation={
        <DailyNotesShortcuts vault={vault} activeDate={activeDate} onOpenDate={onOpenDate} />
      }
    >
      <DailyNotesList
        vault={vault}
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        onOpen={onOpen}
        onOpenDraft={onOpenDraft}
        onOpenDate={onOpenDate}
        rowActions={rowActions}
      />
    </View>
  );
}
