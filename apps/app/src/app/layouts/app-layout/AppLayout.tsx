import { useState, type CSSProperties } from 'react';
import './AppLayout.css';
import { Sidebar } from '../sidebar/Sidebar';
import { PageHost } from '../page/PageHost';
import { SidebarToggle } from './sidebar-toggle/SidebarToggle';
import { SidebarResizeHandle, type SidebarResizeDirection } from './sidebar-resize-handle/SidebarResizeHandle';
import { useSidebarWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from './useSidebarWidth';
import type { Application } from '@core/application/Application';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { useVault } from '@app/hooks/useVault';
import { useEffectivePageState } from '@app/hooks/useEffectivePageState';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { TauriDragStrip } from '@components/tauri-drag-strip/TauriDragStrip';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { buildResourceMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { createResourceLocationActions } from '@app/layouts/resourceLocationActions';
import type { ResourceOverlayState } from '@app/layouts/resourceOverlay';
import { ImageOverlay, type ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';
import { PdfOverlay } from '@features/pdf/PdfOverlay';
import { DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from '@features/tasks/helpers/groupTasks';
import type { TasksViewConfigStore } from '@core/application/task/TasksViewConfigStore';

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
  // Tracks the Sidebar resize handle's current drag direction (updated on
  // every pointermove — see SidebarResizeHandle's own instantaneous-step
  // calculation) so AppLayout.css can suppress its collapse/expand
  // transition only while actively resizing WIDER, per product decision:
  // shrinking keeps the transition (the desired page-expansion feel);
  // growing must track the pointer with zero lag. null whenever no drag is
  // in progress — cleared on pointerup/cancel via handleSidebarResizingChange
  // so a finished drag can never leave a stale direction bleeding into a
  // later, unrelated collapse/expand toggle.
  const [sidebarResizeDirection, setSidebarResizeDirection] = useState<SidebarResizeDirection | null>(
    null
  );

  function handleSidebarResize(width: number, direction: SidebarResizeDirection): void {
    setSidebarWidth(width);
    setSidebarResizeDirection(direction);
  }

  function handleSidebarResizingChange(isResizing: boolean): void {
    if (!isResizing) setSidebarResizeDirection(null);
  }

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

  const { revealResourceInFinder, copyResourcePath, downloadResourceById } =
    createResourceLocationActions(application.vault);

  const resourceMoveDestinations = buildResourceMoveDestinationItems(
    application.membershipSelector,
    application.query
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
            resourceId: actionsEnabled ? resource.id : undefined,
          },
        });
        return;
      case 'pdf':
        setResourceOverlay({ kind: 'pdf', resource, actionsEnabled });
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
    options?: { readonly onSetCoverImage?: () => void }
  ): void {
    setResourceOverlay({ kind: 'image', image, onSetCoverImage: options?.onSetCoverImage });
  }

  function closeResourceOverlay(): void {
    setResourceOverlay(null);
  }

  return (
    <div
      className="app-layout"
      data-sidebar-collapsed={!workspace.isSidebarVisible}
      style={{ '--app-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <div
        className="app-layout__sidebar-slot"
        data-resize-direction={sidebarResizeDirection ?? undefined}
      >
        <aside className="app-layout__sidepanel">
          <TauriDragStrip />
          {
            <Sidebar
              application={application}
              onOpenResource={openVaultResourceOverlay}
              tasksViewConfig={tasksViewConfig}
              onTasksViewConfigChange={updateTasksViewConfig}
            />
          }
          <SidebarResizeHandle
            currentWidth={sidebarWidth}
            minWidth={MIN_SIDEBAR_WIDTH}
            maxWidth={MAX_SIDEBAR_WIDTH}
            onResize={handleSidebarResize}
            onResizeEnd={commitSidebarWidth}
            onResizingChange={handleSidebarResizingChange}
          />
        </aside>
      </div>
      <main className="app-layout__page">
        <TauriDragStrip />
        <PageHost
          application={application}
          onOpenResource={openVaultResourceOverlay}
          onOpenImageOverlay={openImageOverlay}
          tasksViewConfig={tasksViewConfig}
        />
      </main>
      <SidebarToggle
        isSidebarVisible={workspace.isSidebarVisible}
        onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
      />
      <ImageOverlay
        image={resourceOverlay?.kind === 'image' ? resourceOverlay.image : null}
        onClose={closeResourceOverlay}
        onArchiveResource={(id) => void application.resourceOperations.archiveResource(id)}
        onRevealResourceInFinder={revealResourceInFinder}
        onCopyResourcePath={copyResourcePath}
        onDownloadResource={downloadResourceById}
        resourceMoveDestinations={resourceMoveDestinations}
        onMoveResource={(id, destinationFolderId) =>
          void application.resourceOperations.moveResource(id, destinationFolderId)
        }
        onCreateFolder={(name) => application.folderOperations.create(name, null)}
        onSetCoverImage={
          resourceOverlay?.kind === 'image' ? resourceOverlay.onSetCoverImage : undefined
        }
      />
      <PdfOverlay
        resource={resourceOverlay?.kind === 'pdf' ? resourceOverlay.resource : null}
        onClose={closeResourceOverlay}
        resolveResourceUrl={(path) => application.resolveResourceImageUrl(path)}
        onArchiveResource={
          resourceOverlay?.kind === 'pdf' && resourceOverlay.actionsEnabled
            ? (id) => void application.resourceOperations.archiveResource(id)
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
            ? (name) => application.folderOperations.create(name, null)
            : undefined
        }
      />
    </div>
  );
}
