import { useRef, useState } from 'react';
import type { Application } from '@core/application/Application';

import { useActivePage } from '@app/hooks/useActivePage';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { buildBreadcrumbs, buildBreadcrumbsForDraft } from '@core/presentation/buildBreadcrumbs';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import {
  getPageTitlePlaceholder,
  getFolderTitlePlaceholder,
} from '@core/presentation/PageDisplayPlaceholders';
import {
  buildTopBarActions,
  buildDraftTopBarActions,
} from '@app/layouts/page/topbar/buildTopBarActions';
import {
  getFolderArchiveConfirmation,
  getFolderDeleteConfirmation,
  PAGE_DELETE_CONFIRMATION_MESSAGE,
} from '@features/notes/helpers/folderActionConfirmation';
import { duplicateAndOpenPage } from '@features/notes/helpers/duplicateAndOpenPage';
import {
  buildMoveDestinationItems,
  buildResourceMoveDestinationItems,
} from '@features/notes/helpers/buildMoveDestinationItems';
import { Breadcrumbs } from '@app/layouts/page/breadcrumb/Breadcrumbs';
import { toResourcePageModel, toDraftPageModel } from '@app/layouts/page/toResourcePageModel';
import { toCollectionPageModel } from '@features/collection/page/toCollectionPageModel';
import {
  getSystemLocationPresentation,
  getSystemLocationForFolder,
} from '@core/presentation/systemPresentation';
import { Page } from '@app/layouts/page/Page';
import { createDateResolver } from '@app/layouts/page/resolveDate';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { createWikiLinkSuggester } from '@app/layouts/page/wikiLinkSuggestions';
import { createEmbedSuggester } from '@app/layouts/page/embedSuggestions';
import { createEmbedImageResolver } from '@app/layouts/page/resolveEmbedImage';
import { createTagSuggester } from '@app/layouts/page/tagSuggestions';
import {
  getCollectionPageTitleProps,
  createTagCollectionRenameHandler,
} from '@app/layouts/page/tagCollectionRename';
import { MarkdownBody } from '@app/layouts/page/body/MarkdownBody';
import { CollectionBody } from '@app/layouts/page/body/CollectionBody';
import { ArchiveCollectionBody } from '@app/layouts/page/body/ArchiveCollectionBody';
import { AssetsCollectionBody } from '@app/layouts/page/body/AssetsCollectionBody';
import {
  TasksCollectionBody,
  type TasksCollectionView,
} from '@features/tasks/page/TasksCollectionBody';
import { ImageOverlay, type ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@features/markdown/editor/MarkdownEditor';
import { clearCachedEditorSession } from '@features/markdown/editor/codemirror/editorHistoryCache';

interface PageHostProps {
  application: Application;
}

const TASK_COLLECTION_VIEWS: ReadonlySet<string> = new Set<TasksCollectionView>([
  'tasks-today',
  'tasks-upcoming',
  'tasks-completed',
  'tasks-all',
  'tasks-unscheduled',
]);

/**
 * The note-open half of `MarkdownEditor`'s focus policy (the other half —
 * "a restorable cached session always wins" — lives entirely inside
 * `MarkdownEditor.tsx`'s own mount effect, since only it knows about the
 * session cache). Deliberately the *same* emptiness check `Page.tsx`'s own
 * `shouldAutoFocusTitle` applies to this identical `title` value, not a
 * competing rule: when there's no cached session to restore, an empty
 * title should stay the first editing target (title autofocuses, per
 * existing behavior, untouched here), and a non-empty title means the
 * user is opening an already-named note to keep editing its body, so the
 * editor should be ready to type into immediately. See
 * `docs/editor-architecture-decisions.md`'s "Focus restoration" entry.
 */
function focusEditorOnOpen(title: string): boolean {
  return title !== '';
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

  // The Assets collection's own instance of the same lightbox a clicked
  // Markdown image opens (MarkdownEditor.tsx's own imageOverlay state, and
  // Sidebar.tsx's identical sidebar-scoped instance) — ImageOverlay is a
  // plain, stateless component parameterized only by { url, alt }, so a
  // third mount site is reuse, not a second implementation.
  const [assetsImageOverlay, setAssetsImageOverlay] =
    useState<ImageOverlayImage | null>(null);

  // One handle, reused across the draft/note/daily-note branches below —
  // only one of them ever renders per render, and each gets a fresh
  // instance anyway via the per-entity `key` on <Page>. Lets the title's
  // Enter (Page's bodyFocusRef) move focus into the editor without Page
  // needing to know what body actually is.
  const editorRef = useRef<MarkdownEditorHandle>(null);

  // Composed once per render from the currently-attached Vault/PageOperations
  // — cheap, stateless glue (resolveWikiLink.ts), not worth memoizing.
  const resolveWikiLink = createWikiLinkResolver(
    vault,
    application.pageOperations,
    application.folderOperations
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const getWikiLinkSuggestions = createWikiLinkSuggester(
    vault,
    application.pageOperations,
    application.folderOperations
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  // Resource embed autocomplete only, this milestone — no resolver for a
  // renderer to call yet (resolveResourceEmbed.ts exists but isn't wired
  // through as an injected prop until a rendering milestone needs it).
  const getEmbedSuggestions = createEmbedSuggester(vault, application.membershipSelector);
  // Same per-render, stateless-glue composition as resolveWikiLink above —
  // this milestone's rendering counterpart to getEmbedSuggestions.
  const resolveEmbedImage = createEmbedImageResolver(vault, (path) =>
    application.resolveResourceImageUrl(path)
  );
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const resolveTag = createTagResolver(application.navigation, vault);
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const getTagSuggestions = createTagSuggester(vault);
  // Same per-render, stateless-glue composition as resolveWikiLink above.
  const resolveDate = createDateResolver(vault, application.pageOperations);

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
  // Committed-stage only (autosave-execution-model.md §3.1) — no Gate call,
  // no persistence. Durable-stage persistence is a separate, payload-free
  // request (onRequestSave below), fired on blur.
  const onUpdateMarkdown = (pageId: string, markdown: string): void => {
    application.pageOperations.commitEdit(pageId, markdown);
  };
  const onRequestSave = (pageId: string): void => {
    void application.pageOperations.requestSave(pageId);
  };

  const onUpdateDescription = (pageId: string, description: string): void => {
    void application.pageOperations.updateMetadata(pageId, { description });
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

    // Deletion is the one truly non-reversible page action — unlike
    // archive/restore below (which deliberately do NOT clear this),
    // a deleted page's cached editing session (editorHistoryCache.ts)
    // can never legitimately be returned to, so it's cleared eagerly
    // here rather than left to decay as an inert, never-looked-up-again
    // entry. Best-effort: if this page's MarkdownEditor is still mounted
    // and unmounts after this call (the common outcome of a delete,
    // since navigation typically moves away from the deleted page), its
    // own cleanup will write the entry back — a known, accepted race
    // (see clearCachedEditorSession's own doc comment) that can only
    // ever make this a no-op, never cause incorrect behavior.
    clearCachedEditorSession(activePageId);
    void application.pageOperations.delete(activePageId);
  };

  const onDuplicate = (): void => {
    if (!activePageId) {
      return;
    }

    void duplicateAndOpenPage(application.pageOperations, activePageId);
  };

  const onToggleFavorite = (): void => {
    if (!activePageId || !page) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, {
      favorite: !page.metadata.favorite,
    });
  };

  // Shared by both the persisted-page and draft render branches below —
  // PageOperations.updateMetadata() already handles both cases itself
  // (a draft's committed cover patch promotes it via the same persistDraft
  // helper title/body commits already use), so there is no separate
  // draft-specific persistence path to wire here.
  const onSetCoverImage = (url: string): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, { cover: url });
  };

  const onSetCoverImageFromUpload = (sourcePath: string): void => {
    if (!activePageId) {
      return;
    }

    void (async () => {
      const relativePath = await application.importCoverAsset(sourcePath);
      await application.pageOperations.updateMetadata(activePageId, {
        cover: relativePath,
      });
    })();
  };

  const onRemoveCoverImage = (): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.updateMetadata(activePageId, { cover: null });
  };

  const onMoveNote = (destinationFolderId: string | null): void => {
    if (!activePageId) {
      return;
    }

    void application.pageOperations.move(activePageId, destinationFolderId);
  };

  const onMoveFolder = (folderId: string, destinationFolderId: string | null): void => {
    void application.folderOperations.move(folderId, destinationFolderId);
  };

  // Both a persisted Note's title and a folder's name use the same
  // continuous-commit/debounced-autosave channel model (SaveCoordinator's
  // channel primitives + a FieldEditState<string>), not a single
  // blur-triggered rename() call — folder rename() itself still does the
  // actual persisting underneath; this only changes how often it's called
  // and adds Escape-cancel support (onCancel reverts the pending value).
  const onEditPageTitle = (pageId: string, title: string): void => {
    application.pageOperations.commitTitle(pageId, title);
  };
  const onFlushPageTitle = (pageId: string): void => {
    void application.pageOperations.requestTitleSave(pageId);
  };
  const onCancelPageTitle = (pageId: string): void => {
    application.pageOperations.cancelTitleEdit(pageId);
  };

  const onEditFolderName = (folderId: string, name: string): void => {
    application.folderOperations.commitName(folderId, name);
  };
  const onFlushFolderName = (folderId: string): void => {
    void application.folderOperations.requestNameSave(folderId);
  };
  const onCancelFolderName = (folderId: string): void => {
    application.folderOperations.cancelNameEdit(folderId);
  };

  if (activeFolderId) {
    const folder = vault.getFolder(activeFolderId);

    if (!folder) {
      throw new Error(`Folder not found: ${activeFolderId}`);
    }

    const model = toCollectionPageModel(
      folder,
      vault,
      application.query,
      application.effectivePageState,
      application.membershipSelector,
      workspace,
      {
        onOpenFolder,
        onOpenNote: (id: string) => application.pageOperations.open(id),
        onOpenDraftNote: (id: string) => application.workspace.openPage(id),
      }
    );

    const breadcrumbs = buildBreadcrumbs(folder, vault, application.membershipSelector, onOpenFolder);
    // Confirmation copy is computed here (one predicate, shared with the
    // sidebar's identical computation in Sidebar.Notes.tsx) and handed to
    // ResourceTopBarActions as a message — that component owns showing the
    // Confirmation surface and gating dispatch on it, so onArchive/onDelete
    // below are plain, unconditional calls straight to the domain
    // operation; navigation after a successful archive/delete is owned by
    // FolderOperations itself (ADR-025's fallback-page pattern), not by
    // this component.
    const archiveConfirmation = getFolderArchiveConfirmation(vault, folder.id);
    const deleteConfirmation = getFolderDeleteConfirmation(vault, folder.id);
    const topBar = buildTopBarActions(folder, {
      membershipSelector: application.membershipSelector,
      onArchive: () => void application.folderOperations.archive(folder.id),
      onRestore: () => void application.folderOperations.restore(folder.id),
      onDelete: () => void application.folderOperations.delete(folder.id),
      onToggleFavorite: () =>
        void application.folderOperations.updateMetadata(folder.id, {
          favorite: !folder.metadata.favorite,
        }),
      onSetCoverImage: (url) =>
        void application.folderOperations.updateMetadata(folder.id, { cover: url }),
      onSetCoverImageFromUpload: (sourcePath) => {
        void (async () => {
          const relativePath = await application.importCoverAsset(sourcePath);
          await application.folderOperations.updateMetadata(folder.id, {
            cover: relativePath,
          });
        })();
      },
      onRemoveCoverImage: () =>
        void application.folderOperations.updateMetadata(folder.id, {
          cover: null,
        }),
      archiveConfirmationMessage: archiveConfirmation.hasDescendants
        ? archiveConfirmation.message
        : undefined,
      // Unlike Archive above, Delete always confirms — a delete is only
      // ever reachable here for an archived/Archive-descendant folder
      // (buildTopBarActions.tsx's isDeletable), and the product decision is
      // to require confirmation for every such delete regardless of
      // whether the folder is empty (see getFolderDeleteConfirmation's own
      // doc comment).
      deleteConfirmationMessage: deleteConfirmation.message,
      // A reserved folder never reaches this branch's menu (buildFolderTopBarMenu
      // only renders for an ordinary folder — see topBar's own dispatch), so
      // excluding `folder.id` (and its descendants, via
      // buildMoveDestinationItems' own walk) is always excluding a real,
      // movable folder here, never a reserved one.
      moveDestinations: buildMoveDestinationItems(application.membershipSelector, folder.id),
      onMove: (destinationFolderId) => onMoveFolder(folder.id, destinationFolderId),
      onCreateFolder: (name) => application.folderOperations.create(name, null),
    });
    // A reserved folder (Archive, Inbox, Templates, Daily Notes) can't be
    // renamed or deleted — buildTopBarActions already dispatches it to
    // ReservedFolderTopBarActions (no delete button) via
    // MembershipSelector.isSystemFolder, but title-editability has no
    // equivalent automatic gate, so it's checked here explicitly.
    const isRenameable = !application.membershipSelector.isSystemFolder(folder);
    // The Archive folder gets a resource-aware body (ArchiveCollectionBody)
    // instead of the plain folder/note-shaped CollectionBody — see that
    // component's own doc comment for why this isn't a CollectionPageModel
    // extension. Every other folder (including every other reserved one)
    // keeps the exact same CollectionBody rendering as before.
    const isArchiveView =
      getSystemLocationForFolder(folder, application.membershipSelector) === 'archive';

    return (
      <>
        <Page
          isSidebarVisible={workspace.isSidebarVisible}
          onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
          canNavigateBack={workspace.canNavigateBack}
          canNavigateForward={workspace.canNavigateForward}
          onNavigateBack={() => application.navigation.back()}
          onNavigateForward={() => application.navigation.forward()}
          title={model.title}
          description={model.description}
          titleEditable={isRenameable}
          titlePlaceholder={getFolderTitlePlaceholder()}
          onTitleEdit={isRenameable ? (name) => onEditFolderName(folder.id, name) : undefined}
          onTitleFlush={isRenameable ? () => onFlushFolderName(folder.id) : undefined}
          onTitleCancel={isRenameable ? () => onCancelFolderName(folder.id) : undefined}
          breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
          actions={topBar.actions}
          coverImage={
            application.resolveCoverImageForDisplay(model.coverImage) ?? undefined
          }
          body={
            isArchiveView ? (
              <ArchiveCollectionBody
                vault={vault}
                folders={model.folders}
                notes={model.notes}
                resources={application.membershipSelector.getArchivedResources()}
                onOpenImage={(resource) =>
                  setAssetsImageOverlay({
                    url: application.resolveResourceImageUrl(resource.path),
                    alt: getResourceDisplayName(resource),
                  })
                }
                onRestoreResource={(id) =>
                  void application.resourceOperations.restoreResource(id)
                }
                onDeleteResource={(id) =>
                  void application.resourceOperations.deleteResource(id)
                }
                onRestoreFolder={(id) => void application.folderOperations.restore(id)}
                onDeleteFolder={(id) => void application.folderOperations.delete(id)}
                onRestoreNote={(id) => void application.pageOperations.restore(id)}
                onDeleteNote={(id) => void application.pageOperations.delete(id)}
                resolveWikiLink={resolveWikiLink}
                resolveTag={resolveTag}
              />
            ) : (
              <CollectionBody
                folders={model.folders}
                notes={model.notes}
                resolveWikiLink={resolveWikiLink}
                resolveTag={resolveTag}
              />
            )
          }
        />
        {isArchiveView && (
          <ImageOverlay
            image={assetsImageOverlay}
            onClose={() => setAssetsImageOverlay(null)}
          />
        )}
      </>
    );
  }

  // The Assets collection is a filtered view too, but
  // CollectionPageModel/CollectionBody are folder+note shaped — no room for
  // `kind` (image vs. pdf) — so this dispatches to AssetsCollectionBody
  // instead, before the generic filtered-view branch below, same reasoning
  // as the task-views branch that follows it.
  if (
    workspace.activeView?.type === 'filtered-view' &&
    workspace.activeView.view.kind === 'assets'
  ) {
    const resources = application.membershipSelector.getAllVisibleResources();

    return (
      <>
        <Page
          isSidebarVisible={workspace.isSidebarVisible}
          onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
          canNavigateBack={workspace.canNavigateBack}
          canNavigateForward={workspace.canNavigateForward}
          onNavigateBack={() => application.navigation.back()}
          onNavigateForward={() => application.navigation.forward()}
          title={getSystemLocationPresentation('assets').label}
          titleEditable={false}
          breadcrumbs={<Breadcrumbs items={[]} />}
          body={
            <AssetsCollectionBody
              resources={resources}
              onOpenImage={(resource) =>
                setAssetsImageOverlay({
                  url: application.resolveResourceImageUrl(resource.path),
                  alt: getResourceDisplayName(resource),
                })
              }
              onRenameResource={(id, name) =>
                void application.resourceOperations.renameResource(id, name)
              }
              onArchiveResource={(id) =>
                void application.resourceOperations.archiveResource(id)
              }
              resourceMoveDestinations={buildResourceMoveDestinationItems(
                application.membershipSelector,
                application.query
              )}
              onMoveResource={(id, destinationFolderId) =>
                void application.resourceOperations.moveResource(id, destinationFolderId)
              }
              onCreateFolder={(name) => application.folderOperations.create(name, null)}
            />
          }
        />
        <ImageOverlay
          image={assetsImageOverlay}
          onClose={() => setAssetsImageOverlay(null)}
        />
      </>
    );
  }

  // The task collection views are filtered views too, but
  // CollectionPageModel/CollectionBody are folder+note shaped — no room
  // for completed/dueDate — so this dispatches to TasksCollectionBody
  // instead of toCollectionPageModel, before the generic filtered-view
  // branch below (which stays exactly as ADR-022 left it for Workspace/
  // Favorites).
  if (
    workspace.activeView?.type === 'filtered-view' &&
    TASK_COLLECTION_VIEWS.has(workspace.activeView.view.kind)
  ) {
    const view = workspace.activeView.view.kind as TasksCollectionView;

    return (
      <Page
        isSidebarVisible={workspace.isSidebarVisible}
        onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={getSystemLocationPresentation(view).label}
        titleEditable={false}
        breadcrumbs={<Breadcrumbs items={[]} />}
        body={
          <TasksCollectionBody
            view={view}
            tasks={[...vault.tasks()]}
            workspace={workspace}
            onToggleComplete={(task) => void application.taskOperations.toggleComplete(task)}
            onOpenTask={(task) => void application.pageOperations.open(task.sourcePageId)}
            onOpenCompleted={() => application.navigation.openTasksCompleted()}
            resolveWikiLink={resolveWikiLink}
            resolveTag={resolveTag}
          />
        }
      />
    );
  }

  // A filtered view (ADR-022) — Workspace-root or Favorites — has no
  // backing Folder/breadcrumb trail or per-resource top-bar actions
  // (archive/restore/delete don't apply to a view), so this branch is
  // deliberately smaller than the folder branch above, not a stripped-down
  // copy of it.
  if (workspace.activeView?.type === 'filtered-view') {
    const view = workspace.activeView.view;

    const model = toCollectionPageModel(
      { view },
      vault,
      application.query,
      application.effectivePageState,
      application.membershipSelector,
      workspace,
      {
        onOpenFolder,
        onOpenNote: (id: string) => application.pageOperations.open(id),
        onOpenDraftNote: (id: string) => application.workspace.openPage(id),
      }
    );

    // Tag is the one filtered view that's renameable — reuses the exact
    // same inline title-edit mechanism (PageTitle/EditableText,
    // titleEditable + onTitleCommit) Folder rename already established,
    // not a topbar menu item (no existing precedent for that shape here).
    // Workspace-root/Favorites remain non-editable, unchanged.
    const titleProps = getCollectionPageTitleProps(view, model.title);
    const onTitleCommit =
      view.kind === 'tag'
        ? createTagCollectionRenameHandler(
            application.tagOperations,
            application.navigation,
            view.tagName
          )
        : undefined;

    return (
      <Page
        isSidebarVisible={workspace.isSidebarVisible}
        onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={titleProps.title}
        description={model.description}
        titleEditable={titleProps.titleEditable}
        onTitleCommit={onTitleCommit}
        breadcrumbs={<Breadcrumbs items={[]} />}
        body={
          <CollectionBody
            folders={model.folders}
            notes={model.notes}
            resolveWikiLink={resolveWikiLink}
            resolveTag={resolveTag}
          />
        }
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
      draft.title ?? getPageTitlePlaceholder(draft.type),
      draft.type,
      vault,
      application.membershipSelector,
      onOpenFolder
    );
    const model = toDraftPageModel(
      activePageId,
      draft.type,
      draft.title,
      session,
      onUpdateMarkdown,
      onRequestSave
    );
    const draftTopBar = buildDraftTopBarActions(draft.type, {
      onSetCoverImage,
      onSetCoverImageFromUpload,
      onRemoveCoverImage,
    });

    return (
      <Page
        titleKey={activePageId}
        isSidebarVisible={workspace.isSidebarVisible}
        onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => application.navigation.back()}
        onNavigateForward={() => application.navigation.forward()}
        title={model.title}
        description={model.description}
        titleEditable
        titlePlaceholder={getPageTitlePlaceholder(draft.type)}
        breadcrumbs={<Breadcrumbs items={draftBreadcrumbs} />}
        // Same page chrome as a persisted page (ADR-017 Decision item 9) —
        // archive/restore/delete render disabled, not omitted, since they
        // don't apply until this draft is actually persisted.
        actions={draftTopBar.actions}
        bodyFocusRef={editorRef}
        onTitleCommit={(title) =>
          void application.pageOperations.updateDraftTitle(activePageId, title)
        }
        body={
          <MarkdownBody>
            <MarkdownEditor
              key={activePageId}
              pageId={activePageId}
              ref={editorRef}
              markdown={model.markdown}
              focusOnOpen={focusEditorOnOpen(model.title)}
              onEdit={(markdown) => model.updateMarkdown(markdown)}
              onFlush={() => model.requestSave()}
              resolveWikiLink={resolveWikiLink}
              getWikiLinkSuggestions={getWikiLinkSuggestions}
              getEmbedSuggestions={getEmbedSuggestions}
              resolveEmbedImage={resolveEmbedImage}
              resolveTag={resolveTag}
              getTagSuggestions={getTagSuggestions}
              resolveDate={resolveDate}
              onSetCoverImage={onSetCoverImage}
            />
          </MarkdownBody>
        }
      />
    );
  }

  const breadcrumbs = buildBreadcrumbs(page, vault, application.membershipSelector, onOpenFolder);

  // Note and Daily Note render identically today (both markdown-editable,
  // both resolve through toResourcePageModel/buildTopBarActions) — this
  // guard exists because page.type is user-editable frontmatter, not a
  // TypeScript-enforced value, so a malformed/unexpected type on disk must
  // fail loudly rather than silently render as one of the two known types.
  // Reintroduce a per-type branch here (or a registry) if a future page
  // type actually needs different rendering.
  if (page.type !== 'note' && page.type !== 'daily-note') {
    throw new Error(`Unsupported page type: ${page.type}`);
  }

  const model = toResourcePageModel(
    page,
    session,
    onUpdateMarkdown,
    onRequestSave,
    onUpdateDescription
  );
  // Move applies only to Notes and Folders (approved contract) — a Daily
  // Note's menu never includes a `move-to` item (dailyNoteTopBarMenu.config.ts),
  // so moveDestinations/onMove are only ever computed and passed for a
  // real Note, never for a Daily Note.
  const topBar = buildTopBarActions(page, {
    membershipSelector: application.membershipSelector,
    onArchive,
    onRestore,
    onDelete,
    onDuplicate,
    onToggleFavorite,
    onSetCoverImage,
    onSetCoverImageFromUpload,
    onRemoveCoverImage,
    // A note/daily-note delete is only ever reachable here for an
    // archived/Archive-descendant page (buildTopBarActions.tsx's
    // isDeletable) — every such delete now requires confirmation, so this
    // is always passed rather than gated (see PAGE_DELETE_CONFIRMATION_MESSAGE's
    // own doc comment).
    deleteConfirmationMessage: PAGE_DELETE_CONFIRMATION_MESSAGE,
    moveDestinations:
      page.type === 'note'
        ? buildMoveDestinationItems(application.membershipSelector)
        : undefined,
    onMove: page.type === 'note' ? onMoveNote : undefined,
    onCreateFolder:
      page.type === 'note'
        ? (name) => application.folderOperations.create(name, null)
        : undefined,
  });
  // A Daily Note's title is derived from its date and is its permanent
  // calendar identity (toResourcePageModel's own title comment) — renaming
  // it would desynchronize its filename from the deterministic path
  // DailyNoteService/Application.openFallbackPage resolve by date, so it
  // stays view-only here the same way a reserved folder's title does
  // (isRenameable above). Notes have no such constraint.
  const isRenameable = page.type !== 'daily-note';

  return (
    <Page
      titleKey={activePageId}
      isSidebarVisible={workspace.isSidebarVisible}
      onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
      canNavigateBack={workspace.canNavigateBack}
      canNavigateForward={workspace.canNavigateForward}
      onNavigateBack={() => application.navigation.back()}
      onNavigateForward={() => application.navigation.forward()}
      title={model.title}
      description={model.description}
      titleEditable={isRenameable}
      onTitleEdit={isRenameable ? (title) => onEditPageTitle(page.id, title) : undefined}
      onTitleFlush={isRenameable ? () => onFlushPageTitle(page.id) : undefined}
      onTitleCancel={isRenameable ? () => onCancelPageTitle(page.id) : undefined}
      breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
      actions={topBar.actions}
      coverImage={
        application.resolveCoverImageForDisplay(model.coverImage) ?? undefined
      }
      bodyFocusRef={editorRef}
      body={
        <MarkdownBody>
          <MarkdownEditor
            key={activePageId}
            pageId={activePageId}
            ref={editorRef}
            markdown={model.markdown}
            focusOnOpen={focusEditorOnOpen(model.title)}
            onEdit={(markdown) => model.updateMarkdown(markdown)}
            onFlush={() => model.requestSave()}
            resolveWikiLink={resolveWikiLink}
            getWikiLinkSuggestions={getWikiLinkSuggestions}
            getEmbedSuggestions={getEmbedSuggestions}
            resolveEmbedImage={resolveEmbedImage}
            resolveTag={resolveTag}
            getTagSuggestions={getTagSuggestions}
            resolveDate={resolveDate}
            onSetCoverImage={onSetCoverImage}
          />
        </MarkdownBody>
      }
    />
  );
}
