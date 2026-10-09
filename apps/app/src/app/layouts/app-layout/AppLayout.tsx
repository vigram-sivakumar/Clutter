import { useCallback, useRef, useState, type CSSProperties } from 'react';
import './AppLayout.css';
import { CreateTemplateProvider } from '@app/layouts/createTemplate/CreateTemplateProvider';
import { Sidebar } from '../sidebar/Sidebar';
import { PageHost } from '../page/PageHost';
import { SidebarToggle } from './sidebar-toggle/SidebarToggle';
import { SidebarResizeHandle } from './sidebar-resize-handle/SidebarResizeHandle';
import { useSidebarTransition } from './useSidebarTransition';
import { useSidebarWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from './useSidebarWidth';
import type { Application } from '@core/application/Application';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { useVault } from '@app/hooks/useVault';
import { useEffectivePageState } from '@app/hooks/useEffectivePageState';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { TauriDragStrip } from '@components/tauri-drag-strip/TauriDragStrip';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { buildMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { createFolderInZone } from '@features/notes/helpers/createFolderInZone';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
import { downloadRemoteImage } from '@shared/helpers/downloadRemoteImage';
import { downloadResource } from '@shared/helpers/downloadResource';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { createResourceLocationActions } from '@app/layouts/resourceLocationActions';
import type { ResourceOverlayState } from '@app/layouts/resourceOverlay';
import { ImageOverlay, type ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';
import { Toast, type ToastMessage } from '@components/toast/Toast';
import { Confirmation } from '@components/confirmation/Confirmation';
import { Dialog } from '@components/dialog/Dialog';
import { ROOT_DESTINATION_ID } from '@components/picker-list/PickerList.types';
import { RestoreNeedsDestinationError } from '@core/vault/persistence/PagePersistenceCoordinator';
import { RestoreDestinationPicker } from './RestoreDestinationPicker';
import type { RestoreDestinationRequest } from '@app/layouts/page/restoreDestination';
import { CoverNotePicker, type CoverTarget } from './CoverNotePicker';
import { buildCoverNoteItems } from '@features/notes/helpers/buildCoverNoteItems';
import { buildCoverFolderItems } from '@features/notes/helpers/buildCoverFolderItems';
import { newCoverPatch } from '@core/application/page/coverPatch';
import { CoverAssetsProvider, type CoverPickerAsset } from '@app/layouts/page/cover/image-picker/CoverAssetsContext';
import {
  ImageFileActionsProvider,
  isRemoteImageReference,
  type ImageFileActions,
} from '@app/layouts/page/ImageFileActionsContext';
import { PdfOverlay } from '@features/pdf/PdfOverlay';
import {
  DEFAULT_TASK_DISPLAY_CONFIG,
  HIDEABLE_TASK_GROUP_IDS,
  type TaskDisplayConfig,
  type TaskGroupId,
} from '@features/tasks/helpers/groupTasks';
import { resolveTasksTab, type TasksTabValue } from '@features/tasks/page/TasksTabs';
import type { TasksViewConfigStore } from '@core/application/task/TasksViewConfigStore';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';

/**
 * Resolves the shared Tasks-view Show completed / Auto-sort completed
 * preference from `TasksViewConfigStore`, falling back to
 * DEFAULT_TASK_DISPLAY_CONFIG for any field never persisted — mirrors
 * PageHost.tsx's own `resolveCollectionViewState` exactly, for the same
 * reason: the store's persisted shape is optional-by-field, the caller
 * resolves defaults, never the store itself.
 */
function resolveTasksViewConfig(store: TasksViewConfigStore): TaskDisplayConfig {
  const persisted = store.get();
  return {
    showCompleted: persisted.showCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.showCompleted,
    autoSortCompleted: persisted.autoSortCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.autoSortCompleted,
    // Unknown ids (a hand-edited or future file), and Today (never hideable), are dropped rather than trusted.
    hiddenGroups: (persisted.hiddenGroups ?? DEFAULT_TASK_DISPLAY_CONFIG.hiddenGroups ?? []).filter((id): id is TaskGroupId =>
      (HIDEABLE_TASK_GROUP_IDS as readonly string[]).includes(id)
    ),
  };
}

interface AppLayoutProps {
  application: Application;
}

export function AppLayout({ application }: AppLayoutProps) {
  // Single vault subscription for sibling Sidebar + PageHost re-renders.
  useVault(application.vault);
  // ADR-020, M3: EffectivePageState notifies on draft open/close/promotion
  // and on live session edits — none of which Vault.subscribe fires for
  // (drafts are deliberately outside Vault, ADR-017). Sidebar is the only
  // consumer today; PageHost doesn't read this projection.
  useEffectivePageState(application.effectivePageState);
  const workspace = useWorkspace(application.workspace);
  const { width: sidebarWidth, setWidth: setSidebarWidth, commitWidth: commitSidebarWidth } =
    useSidebarWidth();
  // Mirrors the resize handle's own isResizing (true for the duration of
  // an active drag, pointerdown to pointerup/cancel) so AppLayout.css can
  // suppress the collapse/expand transition specifically while manually
  // resizing — resize is always immediate in both directions; the
  // collapse/expand toggle keeps its existing animation, unaffected,
  // since this is false the rest of the time.
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  // The collapse/expand slide, from the slot's own CSS transition: the resize handle is hidden for its duration.
  const sidebarSlotRef = useRef<HTMLDivElement>(null);
  const sidebarTransition = useSidebarTransition(workspace.isSidebarVisible, sidebarSlotRef);

  // The single "which resource overlay is open" state for the whole app —
  // AppLayout is the confirmed common ancestor of every overlay entry point
  // (Sidebar, Assets/Archive via PageHost, Markdown image/PDF embeds via
  // PageHost -> MarkdownEditor), replacing three independent owners with
  // one. See resourceOverlay.ts for the full shape/reasoning.
  const [resourceOverlay, setResourceOverlay] = useState<ResourceOverlayState>(null);

  // The shared Tasks-view Show completed / Auto-sort completed preference
  // — lifted here (rather than local state inside Sidebar's Tasks panel or
  // PageHost's TasksCollectionBody individually) because AppLayout is the
  // confirmed common ancestor of both consumers, the same reasoning
  // resourceOverlay above already documents. Persisted through
  // `application.tasksViewConfigStore`, read once at mount — updates go
  // through `updateTasksViewConfig` below, which keeps this render-visible
  // state and the store in sync, the same shape PageHost.tsx's own
  // `collectionViewState`/`setCollectionViewMode` pairing uses.
  const [tasksViewConfig, setTasksViewConfig] = useState<TaskDisplayConfig>(() =>
    resolveTasksViewConfig(application.tasksViewConfigStore)
  );

  function updateTasksViewConfig(next: TaskDisplayConfig): void {
    setTasksViewConfig(next);
    application.tasksViewConfigStore.update(next);
  }

  // The Tasks page's selected tab — lifted here for the same reason, and persisted in the same store (merged into
  // the same `tasksViewConfig` entry, so the display preferences above are never overwritten by it, nor it by them),
  // so the page reopens on the tab it was left on, across restarts.
  const [tasksTab, setTasksTab] = useState<TasksTabValue>(() =>
    resolveTasksTab(application.tasksViewConfigStore.get().selectedTab)
  );

  function updateTasksTab(next: TasksTabValue): void {
    setTasksTab(next);
    application.tasksViewConfigStore.update({ selectedTab: next });
  }

  // Navigate-to-content requests (Tasks sidebar "Show in note", Tag
  // collection "Open note") → PageHost's editor, carrying each occurrence's
  // exact offsets so the correct content (not just the correct page) is
  // targeted — lifted here for the same reason tasksViewConfig is, just
  // above: AppLayout is the confirmed common ancestor of Sidebar and
  // PageHost. Consumed exactly once by PageHost (which clears it via
  // onRevealHandled once applied), not persisted. See
  // `PendingEditorReveal`'s own doc comment for the full shape and why
  // this one state/callback pair serves every navigation source, not just
  // Tasks.
  const [pendingReveal, setPendingReveal] = useState<PendingEditorReveal | null>(null);

  const { revealResourceInFinder, copyResourcePath, downloadResourceById } =
    createResourceLocationActions(application.vault);

  // An Asset moves only within Assets (ADR-049): the same Move picker, rooted at Assets.
  const resourceMoveDestinations = buildMoveDestinationItems(
    application.membershipSelector,
    undefined,
    'assets'
  );
  const createAssetFolder = createFolderInZone(
    application.folderOperations,
    application.membershipSelector,
    'assets'
  );

  // Opens a real VaultResource, routing to the correct overlay via an
  // exhaustive switch on `resource.kind` — a future third kind fails to
  // compile here instead of silently falling into the `pdf` branch (the
  // failure mode the old `if (kind === 'image') {...} else {...}` call
  // sites had). `archived` disables every resource-mutating action
  // (Archive/Move/Set-cover/Download): an already-archived resource's
  // overlay never offered these (Restore/Delete already live on the
  // Archive row's own hover actions instead) — see resourceOverlay.ts's
  // `actionsEnabled` doc comment for why PDF needs this flag explicitly
  // while ImageOverlay's own `image.resourceId` gate already covers image.
  function openVaultResourceOverlay(
    resource: VaultResource,
    options?: { readonly archived?: boolean }
  ): void {
    const actionsEnabled = !options?.archived;
    switch (resource.kind) {
      case 'image':
        setResourceOverlay({
          kind: 'image',
          image: {
            url: application.resolveResourceImageUrl(resource.path),
            alt: getResourceDisplayName(resource),
            // An archived file keeps its id: its menu is the archived one (Download, Restore, Delete).
            resourceId: resource.id,
            archived: !actionsEnabled || undefined,
          },
          onSetCoverImage: actionsEnabled
            ? () =>
                askForCoverNote(resource.path.slice(`${application.vault.root}/`.length))
            : undefined,
          actionsEnabled,
        });
        return;
      case 'pdf':
        setResourceOverlay({ kind: 'pdf', resource, actionsEnabled, archived: !actionsEnabled || undefined });
        return;
    }
  }

  // Opens an image that doesn't necessarily have a backing VaultResource —
  // the Markdown editor's own image-click entry point (MarkdownEditor.tsx's
  // onImageClickRef) already resolves an optional resourceId itself and
  // hands over a fully-built ImageOverlayImage; forcing that back through a
  // synthetic VaultResource here would be wrong for a genuinely external
  // Markdown image URL, which has no VaultResource to synthesize.
  function openImageOverlay(
    image: ImageOverlayImage,
    options?: { readonly onSetCoverImage?: () => void; readonly actionsEnabled?: boolean }
  ): void {
    setResourceOverlay({
      kind: 'image',
      image,
      onSetCoverImage: options?.onSetCoverImage,
      actionsEnabled: options?.actionsEnabled,
    });
  }

  // Restore returns an archived file to where it was; Delete removes it for good, after a confirmation.
  const [assetPendingDelete, setAssetPendingDelete] = useState<VaultResource | null>(null);

  // A file archived by itself sits directly in Archive/ and has a record of where it came from; one
  // inside an archived folder does not, so it can be deleted but not restored on its own.
  function canRestoreResource(resourceId: string): boolean {
    const archiveFolder = application.vault.getReservedFolder('archive');

    return archiveFolder !== undefined && application.vault.getResource(resourceId)?.parentId === archiveFolder.id;
  }

  // Something put in Archive/ from outside Clutter has no recorded original location: its Restore asks where it
  // should go (a note or folder: anywhere, the vault root first; an Asset: within Assets) and then restores there.
  const [restoreRequest, setRestoreRequest] = useState<RestoreDestinationRequest | null>(null);

  function restoreArchivedResource(resourceId: string): void {
    setResourceOverlay(null);
    application.resourceOperations.restoreResource(resourceId).catch((error: unknown) => {
      if (error instanceof RestoreNeedsDestinationError) {
        setRestoreRequest({ kind: 'asset', id: resourceId });
        return;
      }

      console.error('Could not restore the file.', error);
    });
  }

  function restoreItemTo(request: RestoreDestinationRequest, destinationId: string): void {
    const { kind, id } = request;
    // The vault root is the list's first row (a note or folder); an Asset's root row is the Assets folder itself.
    const destinationFolderId = destinationId === ROOT_DESTINATION_ID ? null : destinationId;
    const done = (error: unknown) => console.error('Could not restore.', error);

    if (kind === 'page') {
      void application.pageOperations.restore(id, { destinationFolderId }).catch(done);
    } else if (kind === 'folder') {
      void application.folderOperations.restore(id, { destinationFolderId }).catch(done);
    } else {
      void application.resourceOperations.restoreResource(id, { destinationFolderId }).catch(done);
    }
  }

  function restoreDestinationItems(request: RestoreDestinationRequest) {
    return buildMoveDestinationItems(
      application.membershipSelector,
      request.kind === 'folder' ? request.id : undefined,
      request.kind === 'asset' ? 'assets' : 'workspace'
    );
  }

  function askToDeleteResource(resourceId: string): void {
    const resource = application.vault.getResource(resourceId);

    if (resource) {
      setAssetPendingDelete(resource);
    }
  }

  function confirmDeleteResource(): void {
    const resource = assetPendingDelete;
    setAssetPendingDelete(null);

    if (resource) {
      setResourceOverlay(null);
      void application.resourceOperations.deleteResource(resource.id);
    }
  }

  // Save to vault runs immediately (like Archive and Move — no confirmation or
  // result dialog) and reports the outcome in a toast. Application joins a
  // second request for the same URL, so a repeated click while one is running
  // doesn't start another save. The detailed breakdown is backlog.
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback(
    (message: Omit<ToastMessage, 'id'>) => setToast({ id: Date.now(), ...message }),
    []
  );

  function startSaveToVault(url: string): void {
    setResourceOverlay(null);
    application
      .saveRemoteImageToVault(url)
      .then((result) => {
        const partial = result.failed.length > 0;
        setToast({
          id: Date.now(),
          tone: partial ? 'error' : 'default',
          text: partial
            ? `Saved to vault, but ${result.failed.length} ${result.failed.length === 1 ? 'reference' : 'references'} could not be updated`
            : result.reusedExisting
              ? 'Already saved in the vault'
              : 'Saved to vault',
        });
      })
      .catch((error: unknown) => {
        console.error('Could not save the image to the vault.', error);
        setToast({ id: Date.now(), tone: 'error', text: 'Could not save to the vault' });
      });
  }

  // "Set as cover image" from an asset's viewer: the asset's cover reference
  // (a vault-relative path, or the remote URL as is) waits here while the user
  // picks which note or folder gets it. Only that target's cover metadata changes.
  const [coverTarget, setCoverTarget] = useState<string | null>(null);

  function askForCoverNote(reference: string): void {
    setResourceOverlay(null);
    setCoverTarget(reference);
  }

  function setCover(target: CoverTarget): void {
    const reference = coverTarget;
    setCoverTarget(null);
    if (reference !== null) {
      const update =
        target.kind === 'folder'
          ? application.folderOperations.updateMetadata(target.id, newCoverPatch(reference))
          : application.pageOperations.updateMetadata(target.id, newCoverPatch(reference));
      void update.catch((error: unknown) => console.error('Could not set the cover image.', error));
    }
  }

  // The page cover menu's file actions. A remote cover saves into the vault through the same
  // Save to vault flow (and result dialog) as the asset menu — it rewrites every use of the URL,
  // covers included. Download saves the file anywhere: a remote one is fetched, one already in the
  // vault (a vault-relative reference) is copied from its file.
  const coverImageActions: ImageFileActions = {
    saveToVault: startSaveToVault,
    download: (reference) => {
      if (isRemoteImageReference(reference)) {
        void downloadRemoteImage(reference);
        return;
      }
      const fileName = reference.split('/').pop() ?? 'image';
      void downloadResource(`${application.vault.root}/${reference}`, fileName);
    },
  };

  // The cover picker's Asset tab: every image the Assets collection holds
  // (vault files anywhere, plus remote images in use). Derived when the tab
  // renders, so it is never stale.
  function listCoverPickerAssets(): CoverPickerAsset[] {
    const prefix = `${application.vault.root}/`;
    const result: CoverPickerAsset[] = [];
    for (const asset of application.membershipSelector.getAllAssets()) {
      if (asset.kind !== 'image') continue;
      if (asset.source === 'local') {
        const { path } = asset.resource;
        if (!path.startsWith(prefix)) continue;
        result.push({
          id: asset.id,
          name: asset.name,
          previewUrl: application.resolveResourceImageUrl(path),
          cover: path.slice(prefix.length),
        });
      } else {
        result.push({ id: asset.id, name: asset.name, previewUrl: asset.url, cover: asset.url });
      }
    }
    return result;
  }

  function closeResourceOverlay(): void {
    setResourceOverlay(null);
  }

  return (
    <CreateTemplateProvider application={application}>
    <div
      className="app-layout"
      data-sidebar-collapsed={!workspace.isSidebarVisible}
      data-resizing={isResizingSidebar || undefined}
      data-sidebar-transitioning={sidebarTransition.transitioning || undefined}
      style={{ '--app-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <div
        ref={sidebarSlotRef}
        className="app-layout__sidebar-slot"
        onTransitionEnd={sidebarTransition.onTransitionEnd}
      >
        <aside className="app-layout__sidepanel">
          <TauriDragStrip />
          {
            <Sidebar
              application={application}
              onOpenResource={openVaultResourceOverlay}
              tasksViewConfig={tasksViewConfig}
              onTasksViewConfigChange={updateTasksViewConfig}
              onRequestReveal={setPendingReveal}
            />
          }
        </aside>
      </div>
      <SidebarResizeHandle
        currentWidth={sidebarWidth}
        minWidth={MIN_SIDEBAR_WIDTH}
        maxWidth={MAX_SIDEBAR_WIDTH}
        onResize={setSidebarWidth}
        onResizeEnd={commitSidebarWidth}
        onResizingChange={setIsResizingSidebar}
        onToggleCollapse={() => workspace.toggleSidebarVisible()}
        isCollapsed={!workspace.isSidebarVisible}
      />
      <main className="app-layout__page">
        <TauriDragStrip />
        <CoverAssetsProvider value={listCoverPickerAssets}>
        <ImageFileActionsProvider value={coverImageActions}>
        <PageHost
          application={application}
          onOpenResource={openVaultResourceOverlay}
          onOpenImageOverlay={openImageOverlay}
          onSetAssetAsCover={askForCoverNote}
          onShowToast={showToast}
          onNeedsRestoreDestination={setRestoreRequest}
          tasksViewConfig={tasksViewConfig}
          onTasksViewConfigChange={updateTasksViewConfig}
          tasksTab={tasksTab}
          onTasksTabChange={updateTasksTab}
          pendingReveal={pendingReveal}
          onRequestReveal={setPendingReveal}
          onRevealHandled={() => setPendingReveal(null)}
        />
        </ImageFileActionsProvider>
        </CoverAssetsProvider>
      </main>
      <SidebarToggle
        isSidebarVisible={workspace.isSidebarVisible}
        onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
      />
      <ImageOverlay
        image={resourceOverlay?.kind === 'image' ? resourceOverlay.image : null}
        onClose={closeResourceOverlay}
        onArchiveResource={(id) => {
          closeResourceOverlay();
          void application.resourceOperations.archiveResource(id);
        }}
        onRevealResourceInFinder={revealResourceInFinder}
        onCopyResourcePath={copyResourcePath}
        onDownloadResource={downloadResourceById}
        onRestoreResource={
          resourceOverlay?.kind === 'image' &&
          resourceOverlay.image.archived &&
          resourceOverlay.image.resourceId &&
          canRestoreResource(resourceOverlay.image.resourceId)
            ? restoreArchivedResource
            : undefined
        }
        onDeleteResource={askToDeleteResource}
        resourceMoveDestinations={resourceMoveDestinations}
        onMoveResource={(id, destinationFolderId) =>
          void application.resourceOperations.moveResource(id, destinationFolderId)
        }
        onCreateFolder={createAssetFolder}
        remoteImageActions={
          resourceOverlay?.kind === 'image' && resourceOverlay.actionsEnabled === false
            ? undefined
            : {
                onSaveToVault: startSaveToVault,
                onOpenInBrowser: (url) => void openExternalUrl(url),
                onCopyLink: (url) => void copyTextToClipboard(url),
                onDownload: (url) => void downloadRemoteImage(url),
              }
        }
        onSetCoverImage={
          resourceOverlay?.kind === 'image' ? resourceOverlay.onSetCoverImage : undefined
        }
      />
      <Toast toast={toast} onDismiss={dismissToast} />
      <RestoreDestinationPicker
        open={restoreRequest !== null}
        items={restoreRequest ? restoreDestinationItems(restoreRequest) : []}
        onClose={() => setRestoreRequest(null)}
        onSelect={(destinationId) => {
          const request = restoreRequest;
          setRestoreRequest(null);

          if (request) {
            restoreItemTo(request, destinationId);
          }
        }}
      />
      <Dialog open={assetPendingDelete !== null} onClose={() => setAssetPendingDelete(null)} size="medium">
        {assetPendingDelete && (
          <Confirmation
            title="Delete permanently?"
            description={`"${getResourceDisplayName(assetPendingDelete)}" will be deleted permanently. You can’t undo this action.`}
            confirmLabel="Delete"
            onConfirm={confirmDeleteResource}
            onCancel={() => setAssetPendingDelete(null)}
          />
        )}
      </Dialog>
      <CoverNotePicker
        open={coverTarget !== null}
        notes={coverTarget === null ? [] : buildCoverNoteItems(
                application.membershipSelector.getAllVisiblePages(),
                (id) => application.vault.getFolder(id)
              )}
        folders={coverTarget === null ? [] : buildCoverFolderItems(application.membershipSelector)}
        onSelect={setCover}
        onClose={() => setCoverTarget(null)}
      />
      <PdfOverlay
        resource={resourceOverlay?.kind === 'pdf' ? resourceOverlay.resource : null}
        onClose={closeResourceOverlay}
        archived={resourceOverlay?.kind === 'pdf' ? resourceOverlay.archived : undefined}
        onRestoreResource={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.archived && canRestoreResource(resourceOverlay.resource.id)
            ? restoreArchivedResource
            : undefined
        }
        onDeleteResource={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.archived ? askToDeleteResource : undefined
        }
        resolveResourceUrl={(path) => application.resolveResourceImageUrl(path)}
        onArchiveResource={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.actionsEnabled
            ? (id) => {
                closeResourceOverlay();
                void application.resourceOperations.archiveResource(id);
              }
            : undefined
        }
        onRevealResourceInFinder={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.actionsEnabled
            ? revealResourceInFinder
            : undefined
        }
        onCopyResourcePath={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.actionsEnabled
            ? copyResourcePath
            : undefined
        }
        resourceMoveDestinations={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.actionsEnabled
            ? resourceMoveDestinations
            : undefined
        }
        onMoveResource={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.actionsEnabled
            ? (id, destinationFolderId) =>
                void application.resourceOperations.moveResource(id, destinationFolderId)
            : undefined
        }
        onCreateFolder={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.actionsEnabled
            ? createAssetFolder
            : undefined
        }
      />
    </div>
    </CreateTemplateProvider>
  );
}
