import type { Application } from '@core/application/Application';

import { useActivePage } from '@app/hooks/useActivePage';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { buildBreadcrumbs, buildBreadcrumbsForDraft } from '@core/presentation/buildBreadcrumbs';
import { buildTopBarActions } from '@app/layouts/page/topbar/buildTopBarActions';
import { Breadcrumbs } from '@app/layouts/page/breadcrumb/Breadcrumbs';
import { toResourcePageModel, toDraftPageModel } from '@app/layouts/page/toResourcePageModel';
import { toCollectionPageModel } from '@features/collection/page/toCollectionPageModel';
import { Page } from '@app/layouts/page/Page';
import { MarkdownBody } from '@app/layouts/page/body/MarkdownBody';
import { CollectionBody } from '@app/layouts/page/body/CollectionBody';
import { MarkdownEditor } from '@features/markdown/editor/MarkdownEditor';

interface PageHostProps {
  application: Application;
}

/**
 * PageHost is the composition root for page rendering.
 *
 * It resolves the active navigation target, constructs the appropriate ViewModel,
 * and composes the shared Page shell with the appropriate body type.
 *
 * It intentionally contains no business logic or persistence logic.
 *
 * Page dispatch currently uses a switch statement but is expected to evolve into a registry
 * when multiple page types justify the abstraction.
 */
export function PageHost({ application }: PageHostProps) {
  const workspace = useWorkspace(application.workspace);
  const vault = application.vault;

  const activePageId = workspace.activePageId;
  const activeFolderId = workspace.activeFolderId;
  const page = useActivePage(vault, activePageId);

  const rawSession = activePageId
    ? application.pageOperations.getSession(activePageId)
    : undefined;

  // React observes DocumentSession changes through this hook.
  // The session remains the single source of editable document state.
  const session = useDocumentSession(rawSession);

  const onOpenFolder = (id: string) => application.folderOperations.open(id);
  const onUpdateMarkdown = (pageId: string, markdown: string): void => {
    void application.pageOperations.save(pageId, markdown);
  };

  const onArchive = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.archive(activePageId);
  };

  const onRestore = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.restore(activePageId);
  };

  const onDelete = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.delete(activePageId);
  };

  if (activeFolderId) {
    const folder = vault.getFolder(activeFolderId);

    if (!folder) {
      throw new Error(`Folder not found: ${activeFolderId}`);
    }

    const model = toCollectionPageModel(folder, application.query, workspace, {
      onOpenFolder,
      onOpenNote: (id: string) => application.pageOperations.open(id),
    });

    const breadcrumbs = buildBreadcrumbs(folder, vault, onOpenFolder);
    const topBar = buildTopBarActions(folder, { vault });

    return (
      <Page
        title={model.title}
        description={model.description}
        titleEditable={false}
        breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
        actions={topBar.actions}
        coverImage={model.coverImage ?? undefined}
        body={<CollectionBody folders={model.folders} notes={model.notes} />}
      />
    );
  }

  if (!session || !activePageId) {
    return null;
  }

  // Structural presentation (path, parent, breadcrumbs, metadata) must read
  // from the Vault — the live source of truth after moves and archive/restore.
  // DocumentSession owns only the editor buffer and save lifecycle.
  if (!page) {
    // ADR-017: a session with no backing Vault page is an unpersisted
    // draft, not an error, as long as PageOperations still has a
    // descriptor for it (getDraft). Anything else missing from both is
    // the pre-existing "dangling id" error, unchanged.
    const draft = application.pageOperations.getDraft(activePageId);

    if (!draft) {
      throw new Error(`Page not found: ${activePageId}`);
    }

    const draftBreadcrumbs = buildBreadcrumbsForDraft(
      activePageId,
      draft.folderId,
      draft.title ?? 'Untitled',
      draft.type,
      vault,
      onOpenFolder
    );
    const model = toDraftPageModel(activePageId, draft.title, session, onUpdateMarkdown);

    return (
      <Page
        title={model.title}
        description={model.description}
        titleEditable
        titlePlaceholder={draft.type === 'daily-note' ? 'Untitled Note' : 'New Note'}
        breadcrumbs={<Breadcrumbs items={draftBreadcrumbs} />}
        // Archive/restore/delete/move/rename only apply to persisted
        // pages (ADR-017 Decision item 9) — rather than wire them to a
        // draft-shaped topbar menu, they're omitted entirely while
        // unpersisted, so there's no reachable control that would
        // silently no-op against the Gate's abandon-if-missing guard.
        actions={null}
        body={
          <MarkdownBody>
            <MarkdownEditor
              markdown={model.markdown}
              onCommit={(markdown) => model.updateMarkdown(markdown)}
            />
          </MarkdownBody>
        }
      />
    );
  }

  const breadcrumbs = buildBreadcrumbs(page, vault, onOpenFolder);

  // TODO: This temporary dispatch will become a registry-backed page renderer once additional page types exist.
  // The current switch is intentionally retained until there are enough concrete implementations to justify the abstraction.
  switch (page.type) {
    case 'note': {
      const model = toResourcePageModel(page, session, onUpdateMarkdown);
      const topBar = buildTopBarActions(page, { vault, onArchive, onRestore, onDelete });

      return (
        <Page
          title={model.title}
          description={model.description}
          titleEditable
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          actions={topBar.actions}
          coverImage={model.coverImage ?? undefined}
          body={
            <MarkdownBody>
              <MarkdownEditor
                markdown={model.markdown}
                onCommit={(markdown) => model.updateMarkdown(markdown)}
              />
            </MarkdownBody>
          }
        />
      );
    }

    case 'daily-note': {
      const model = toResourcePageModel(page, session, onUpdateMarkdown);
      const topBar = buildTopBarActions(page, { vault, onArchive, onRestore, onDelete });

      return (
        <Page
          title={model.title}
          description={model.description}
          titleEditable
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          actions={topBar.actions}
          coverImage={model.coverImage ?? undefined}
          body={
            <MarkdownBody>
              <MarkdownEditor
                markdown={model.markdown}
                onCommit={(markdown) => model.updateMarkdown(markdown)}
              />
            </MarkdownBody>
          }
        />
      );
    }

    default:
      throw new Error(`Unsupported page type: ${page.type}`);
  }
}
