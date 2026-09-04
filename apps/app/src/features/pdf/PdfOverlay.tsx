import { Overlay } from '@components/overlay/Overlay';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

import { PdfViewer } from './PdfViewer';

import './PdfOverlay.css';

export interface PdfOverlayProps {
  readonly resource: VaultResource | null;
  readonly onClose: () => void;
  /**
   * Turns the resource's own absolute path into a value pdfjs-dist can
   * load — the exact same `Application.resolveResourceImageUrl` every
   * ImageOverlay call site already injects (kind-agnostic despite its
   * name: it's `CoverImageUrlResolver.toLoadableUrl`, `convertFileSrc`
   * under Tauri). Passed in as a plain function, not a resolver instance,
   * same shape as `resolveImageSrc.ts`/`resolveEmbedImage.ts` already use
   * — this file never imports `Application` or the resolver class itself.
   */
  resolveResourceUrl(path: string): string;
  /**
   * Forwarded straight through to `PdfViewer`'s own "More actions"
   * control (`PdfViewerMoreActions`) — same shape as `ImageOverlayProps`'s
   * matching props, minus `onSetCoverImage` (no cover-image concept for a
   * PDF). See `MarkdownEditorProps`'s own matching props for the full doc
   * comment on why these are plain callbacks rather than a
   * `ResourceOperations`/`Vault` import here.
   */
  readonly onArchiveResource?: (resourceId: string) => void;
  readonly onRevealResourceInFinder?: (resourceId: string) => void;
  readonly onCopyResourcePath?: (
    resourceId: string,
    format: LocationPathFormat
  ) => void;
  readonly resourceMoveDestinations?: FolderPickerItem[];
  readonly onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  readonly onCreateFolder?: (name: string) => Promise<string>;
}

/**
 * The PDF counterpart to `ImageOverlay` — built directly on the same
 * `Overlay` primitive (centered, tinted backdrop, strong scrim), never on
 * `Dialog` (sized for forms/menus, wrong fit for viewer-shaped content,
 * exactly the reasoning ImageOverlay's own doc comment already gives).
 * `ImageOverlay` itself is untouched: this is a second, independent
 * mount of `Overlay`, not a shared/modified instance.
 *
 * Owns only the overlay shell + resolving which resource is open; all
 * PDF.js document/render/toolbar concerns live in `PdfViewer`, kept
 * completely out of this file and out of the generic `Overlay` primitive.
 *
 * Resource actions (archive/move/reveal/copy-path) are exposed through
 * `PdfViewer`'s own toolbar "More actions" control
 * (`PdfViewerMoreActions`) — the same Resource menu the sidebar/Assets row
 * already shows for this same resource, just also reachable from inside
 * the open viewer now.
 */
export function PdfOverlay({
  resource,
  onClose,
  resolveResourceUrl,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
}: PdfOverlayProps) {
  const url = resource ? resolveResourceUrl(resource.path) : null;

  return (
    <Overlay
      position="centered"
      scrim="strong"
      open={resource !== null}
      onClose={onClose}
      backdrop="tinted"
      className="pdf-overlay"
    >
      {resource && url && (
        <PdfViewer
          url={url}
          title={resource.name}
          resourceId={resource.id}
          onArchiveResource={onArchiveResource}
          onRevealResourceInFinder={onRevealResourceInFinder}
          onCopyResourcePath={onCopyResourcePath}
          resourceMoveDestinations={resourceMoveDestinations}
          onMoveResource={onMoveResource}
          onCreateFolder={onCreateFolder}
        />
      )}
    </Overlay>
  );
}
