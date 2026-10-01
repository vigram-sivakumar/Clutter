import { useRef, useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DailyNotesShortcuts } from '@features/daily-notes/shortcuts/DailyNotesShortcuts';
import type { Vault } from '@core/vault/models';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { createPageEmbedResolver } from '@app/layouts/page/resolvePageEmbed';
import { revealInFinder } from '@shared/helpers/revealInFinder';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
import {
  getLocationPathRepresentations,
  pickLocationPathRepresentation,
} from '@core/presentation/getLocationPathRepresentations';

import {
  DailyNotesList,
  type DailyNoteRowActions,
  type DailyNotesListHandle,
} from './DailyNotesList';

interface DailyNotesPanelProps {
  vault: Vault;
  query: VaultQuery;
  membershipSelector: MembershipSelector;
  workspace: Workspace;
  navigation: NavigationRouter;
  pageOperations: PageOperations;
  folderOperations: FolderOperations;
  effectivePageState: EffectivePageState;
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
  effectivePageState,
  activeDate,
  onOpen,
  onOpenDraft,
  onOpenDate,
}: DailyNotesPanelProps) {
  // Single owner of "which row's overflow menu is open" — same pattern and
  // same reason as Sidebar.Notes.tsx's rowActions: shared across every row
  // in this tab so only one menu is ever open at a time.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // The Calendar (inside DailyNotesShortcuts, below) and the list are
  // independent siblings in this tree with no other shared channel — this
  // ref is the one seam that lets a calendar date click, after opening the
  // note exactly as it already did, also bring that row into view in the
  // list beneath it.
  const dailyNotesListRef = useRef<DailyNotesListHandle>(null);

  const handleCalendarOpenDate = (date: string) => {
    onOpenDate(date);
    dailyNotesListRef.current?.scrollToDate(date);
  };

  const rowActions: DailyNoteRowActions = {
    openMenuId,
    onOpenMenu: (id) => setOpenMenuId(id),
    onCloseMenu: () => setOpenMenuId(null),

    onArchiveNote: (pageId) => void pageOperations.archive(pageId),

    // Same location-actions pipeline Sidebar.Notes.tsx's onRevealPageInFinder/
    // onCopyPagePath use — a Daily Note is a Page, so this is the exact
    // same implementation, just closed over this component's own `vault`.
    onRevealPageInFinder: (pageId) => {
      const page = vault.getPage(pageId);
      if (page) {
        void revealInFinder(page.path);
      }
    },
    onCopyPagePath: (pageId, format) => {
      const page = vault.getPage(pageId);
      if (!page) {
        return;
      }

      const representations = getLocationPathRepresentations(
        page,
        'page',
        vault.root
      );
      const value = pickLocationPathRepresentation(representations, format);

      if (value !== null) {
        void copyTextToClipboard(value);
      }
    },
  };

  // Same composition PageHost.tsx/Sidebar.Notes.tsx use to inject the page
  // editor's own WikiLink/Tag/embed resolution — cheap, stateless glue, not
  // worth memoizing (resolveTag.ts/resolveWikiLink.ts/resolvePageEmbed.ts).
  const resolveWikiLink = createWikiLinkResolver(
    vault,
    pageOperations,
    folderOperations
  );
  const resolveTag = createTagResolver(navigation, vault);
  const resolveEmbed = createPageEmbedResolver(vault, effectivePageState);

  return (
    <View
      navigation={
        <DailyNotesShortcuts
          vault={vault}
          activeDate={activeDate}
          onOpenDate={handleCalendarOpenDate}
        />
      }
    >
      <DailyNotesList
        ref={dailyNotesListRef}
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
        resolveEmbed={resolveEmbed}
      />
    </View>
  );
}
