import { useState } from 'react';

import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { useRequestCreateTemplate } from '@app/layouts/createTemplate/CreateTemplateProvider';
import { createPageEmbedResolver } from '@app/layouts/page/resolvePageEmbed';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { useToast } from '@components/toast/ToastProvider';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { EffectivePage, EffectivePageState } from '@core/application/page/EffectivePageState';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';
import { buildNoteRowActions } from '@features/notes/helpers/buildNoteRowActions';
import { PageEntry } from '@features/notes/sidebar/FolderTree';
import { AppIcon } from '@shared/icon';

interface TemplatesPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly pageOperations: PageOperations;
  readonly folderOperations: FolderOperations;
  readonly effectivePageState: EffectivePageState;
  readonly membershipSelector: MembershipSelector;
  readonly workspace: Workspace;
  /** Starts a new template — the same action the Create menu's Template item runs (see Sidebar.tsx). */
  readonly onRequestNewTemplate: () => void;
}

/**
 * Every template in the Templates folder, subfolders included, by name. A template is a note, so each
 * row is the Notes sidebar's own note row (same menu, rename and open behaviour).
 */
function collectTemplates(membershipSelector: MembershipSelector): EffectivePage[] {
  const root = membershipSelector.getTemplatesFolder();

  if (!root) {
    return [];
  }

  const templates: EffectivePage[] = [];
  const collect = (folderId: string): void => {
    templates.push(...membershipSelector.getVisibleChildPages(folderId));

    for (const folder of membershipSelector.getVisibleChildFolders(folderId)) {
      collect(folder.id);
    }
  };

  collect(root.id);

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export function Templates({
  vault,
  navigation,
  pageOperations,
  folderOperations,
  effectivePageState,
  membershipSelector,
  workspace,
  onRequestNewTemplate,
}: TemplatesPanelProps) {
  const toast = useToast();
  const requestCreateTemplate = useRequestCreateTemplate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // The same resolution the Notes and Tags rows use for a note's compact Markdown title.
  const resolveWikiLink = createWikiLinkResolver(vault, pageOperations, folderOperations, effectivePageState);
  const resolveTag = createTagResolver(navigation, vault);
  const resolveEmbed = createPageEmbedResolver(vault, effectivePageState);

  const rowActions = buildNoteRowActions({
    onRequestCreateTemplate: requestCreateTemplate,
    vault,
    pageOperations,
    folderOperations,
    membershipSelector,
    toast,
    isOpenPage: (pageId) => workspace.activePageId === pageId,
    openMenuId,
    onOpenMenu: setOpenMenuId,
    onCloseMenu: () => setOpenMenuId(null),
    editingId,
    onStartRename: setEditingId,
    onRenameEnd: () => setEditingId(null),
  });

  return (
    <View
      navigation={
        <Section>
          <Navigation title="New" leading={<AppIcon icon="plus" />} onClick={onRequestNewTemplate} />
        </Section>
      }
    >
      <Section hasHeader={false}>
        {collectTemplates(membershipSelector).map((template) => (
          <PageEntry
            key={template.id}
            entry={template}
            level={0}
            workspace={workspace}
            rowActions={rowActions}
            resolveWikiLink={resolveWikiLink}
            resolveTag={resolveTag}
            resolveEmbed={resolveEmbed}
            onPageClick={(pageId) => void pageOperations.open(pageId)}
            onDraftPageClick={(pageId) => void pageOperations.open(pageId)}
          />
        ))}
      </Section>
    </View>
  );
}
