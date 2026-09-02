import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DailyNotesShortcuts } from '@features/daily-notes/shortcuts/DailyNotesShortcuts';
import type { Vault } from '@core/vault/models';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';

import { DailyNotesList, type DailyNoteRowActions } from './DailyNotesList';

interface DailyNotesPanelProps {
  vault: Vault;
  query: VaultQuery;
  membershipSelector: MembershipSelector;
  workspace: Workspace;
  navigation: NavigationRouter;
  pageOperations: PageOperations;
  folderOperations: FolderOperations;
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
  navigation,
  pageOperations,
  folderOperations,
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
  };

  // Same composition PageHost.tsx/Sidebar.Notes.tsx use to inject the page
  // editor's own WikiLink/Tag resolution — cheap, stateless glue, not worth
  // memoizing (resolveTag.ts/resolveWikiLink.ts).
  const resolveWikiLink = createWikiLinkResolver(vault, pageOperations, folderOperations);
  const resolveTag = createTagResolver(navigation, vault);

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
        resolveWikiLink={resolveWikiLink}
        resolveTag={resolveTag}
      />
    </View>
  );
}
