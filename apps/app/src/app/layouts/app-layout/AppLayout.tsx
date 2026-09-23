import { useState } from 'react';
import './AppLayout.css';
import { Sidebar } from '../sidebar/Sidebar';
import { PageHost } from '../page/PageHost';
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

  // The single "which resource overlay is open" state for the whole app —
  // AppLayout is the confirmed common ancestor of every overlay entry point
  // (Sidebar, Assets/Archive via PageHost, Markdown image/PDF embeds via
  // PageHost -> MarkdownEditor), replacing three independent owners with
  // one. See resourceOverlay.ts for the full shape/reasoning.
  const [resourceOverlay, setResourceOverlay] = useState<ResourceOverlayState>(null);

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
      // Single mechanism, single source of truth (ADR-021): this attribute
      // and the width-driven @media query in AppLayout.css are the only two
      // things that ever set the sidebar's grid-template-columns/opacity —
      // both toggle buttons (Controls, Page.TopBar) only ever flip
      // Workspace.isSidebarVisible, never touch layout directly.
      data-sidebar-collapsed={!workspace.isSidebarVisible}
    >
      <aside className="app-layout__sidepanel">
        <TauriDragStrip />
        {<Sidebar application={application} onOpenResource={openVaultResourceOverlay} />}
      </aside>
      <main className="app-layout__page">
        <TauriDragStrip />
        <PageHost
          application={application}
          onOpenResource={openVaultResourceOverlay}
          onOpenImageOverlay={openImageOverlay}
        />
      </main>
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
