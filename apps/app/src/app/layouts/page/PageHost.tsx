import { useRef } from 'react';
import type { Application } from '@core/application/Application';

import { useActivePage } from '@app/hooks/useActivePage';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { buildBreadcrumbs, buildBreadcrumbsForDraft } from '@core/presentation/buildBreadcrumbs';
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
} from '@features/notes/helpers/folderActionConfirmation';
import { duplicateAndOpenPage } from '@features/notes/helpers/duplicateAndOpenPage';
import { buildMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { Breadcrumbs } from '@app/layouts/page/breadcrumb/Breadcrumbs';
import { toResourcePageModel, toDraftPageModel } from '@app/layouts/page/toResourcePageModel';
import { toCollectionPageModel } from '@features/collection/page/toCollectionPageModel';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { Page } from '@app/layouts/page/Page';
import { MarkdownBody } from '@app/layouts/page/body/MarkdownBody';
import { CollectionBody } from '@app/layouts/page/body/CollectionBody';
import {
  TasksCollectionBody,
  type TasksCollectionView,
} from '@features/tasks/page/TasksCollectionBody';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@features/markdown/editor/MarkdownEditor';

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

  // One handle, reused across the draft/note/daily-note branches below —
  // only one of them ever renders per render, and each gets a fresh
  // instance anyway via the per-entity `key` on <Page>. Lets the title's
  // Enter (Page's bodyFocusRef) move focus into the editor without Page
  // needing to know what body actually is.
  const editorRef = useRef<MarkdownEditorHandle>(null);

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

    void application.pageOperations.delete(activePageId);
  };

  const onDuplicate = (): void => {
    if (!activePageId) {
      return;
    }

    void duplicateAndOpenPage(application.pageOperations, activePageId);
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
      archiveConfirmationMessage: archiveConfirmation.hasDescendants
        ? archiveConfirmation.message
        : undefined,
      deleteConfirmationMessage: deleteConfirmation.hasDescendants
        ? deleteConfirmation.message
        : undefined,
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

    return (
      <Page
        title={model.title}
        description={model.description}
        titleEditable={isRenameable}
        titlePlaceholder={getFolderTitlePlaceholder()}
        onTitleEdit={isRenameable ? (name) => onEditFolderName(folder.id, name) : undefined}
        onTitleFlush={isRenameable ? () => onFlushFolderName(folder.id) : undefined}
        onTitleCancel={isRenameable ? () => onCancelFolderName(folder.id) : undefined}
        breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
        actions={topBar.actions}
        coverImage={model.coverImage ?? undefined}
        body={<CollectionBody folders={model.folders} notes={model.notes} />}
      />
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
    const model = toCollectionPageModel(
      { view: workspace.activeView.view },
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

    return (
      <Page
        title={model.title}
        description={model.description}
        titleEditable={false}
        breadcrumbs={<Breadcrumbs items={[]} />}
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
      draft.title ?? getPageTitlePlaceholder(draft.type),
      draft.type,
      vault,
      application.membershipSelector,
      onOpenFolder
    );
    const model = toDraftPageModel(
      activePageId,
      draft.title,
      session,
      onUpdateMarkdown,
      onRequestSave
    );
    const draftTopBar = buildDraftTopBarActions(draft.type);

    return (
      <Page
        key={activePageId}
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
              ref={editorRef}
              markdown={model.markdown}
              onEdit={(markdown) => model.updateMarkdown(markdown)}
              onFlush={() => model.requestSave()}
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
      key={activePageId}
      title={model.title}
      description={model.description}
      titleEditable
      onTitleEdit={isRenameable ? (title) => onEditPageTitle(page.id, title) : undefined}
      onTitleFlush={isRenameable ? () => onFlushPageTitle(page.id) : undefined}
      onTitleCancel={isRenameable ? () => onCancelPageTitle(page.id) : undefined}
      breadcrumbs={<Breadcrumbs items={breadcrumbs} />}
      actions={topBar.actions}
      coverImage={model.coverImage ?? undefined}
      bodyFocusRef={editorRef}
      body={
        <MarkdownBody>
          <MarkdownEditor
            ref={editorRef}
            markdown={model.markdown}
            onEdit={(markdown) => model.updateMarkdown(markdown)}
            onFlush={() => model.requestSave()}
          />
        </MarkdownBody>
      }
    />
  );
}
