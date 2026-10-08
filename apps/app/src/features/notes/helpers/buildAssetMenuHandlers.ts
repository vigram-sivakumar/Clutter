import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

/** The asset operations a menu surface can supply — each is optional, as the overlays' props are. */
export interface AssetMenuActions {
  onStartRename?(resourceId: string): void;
  onArchiveResource?(resourceId: string): void;
  onRevealResourceInFinder?(resourceId: string): void;
  onCopyResourcePath?(resourceId: string, format: LocationPathFormat): void;
  onDownloadResource?(resourceId: string): void;
  onRestoreResource?(resourceId: string): void;
  onDeleteResource?(resourceId: string): void;
}

/**
 * The id → operation map for a vault asset's menu (ADR-048) — one shape for the Notes-tree row, the
 * image overlay, the PDF embed and the PDF viewer, replacing each one's dispatch ladder. 'move-to'
 * is intercepted by the shared Move picker before dispatch.
 */
export function buildAssetMenuHandlers(
  actions: AssetMenuActions,
  resourceId: string
): ResourceActionHandlers {
  return {
    rename: () => actions.onStartRename?.(resourceId),
    archive: () => actions.onArchiveResource?.(resourceId),
    'reveal-in-finder': () => actions.onRevealResourceInFinder?.(resourceId),
    download: () => actions.onDownloadResource?.(resourceId),
    restore: () => actions.onRestoreResource?.(resourceId),
    delete: () => actions.onDeleteResource?.(resourceId),
    'copy-path-at-vault': () => actions.onCopyResourcePath?.(resourceId, 'at-vault'),
    'copy-path-full-path': () => actions.onCopyResourcePath?.(resourceId, 'full-path'),
    'copy-path-as-markdown': () => actions.onCopyResourcePath?.(resourceId, 'as-markdown'),
  };
}
