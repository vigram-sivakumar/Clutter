import type { Application } from '@core/application/Application';
import type { ToastApi } from '@components/toast/ToastProvider';

export type SelectionBatchAction = 'archive' | 'restore' | 'delete' | 'move' | 'favorite' | 'unfavorite';
type Kind = 'page' | 'folder' | 'asset';

export interface SelectionBatchItem {
  /** False means no completed operation (e.g. restore requires a user choice). */
  run(action: SelectionBatchAction, destination?: string | null): Promise<boolean>;
}

/** Uses the same application operations as the single-item menu, without its toast wrappers. */
export function buildSelectionBatchItem(app: Application, kind: Kind, id: string): SelectionBatchItem {
  return {
    async run(action, destination) {
      const { vault, membershipSelector, pageOperations, folderOperations, resourceOperations } = app;
      const entity = kind === 'page' ? vault.getPage(id) : kind === 'folder' ? vault.getFolder(id) : undefined;
      const asset = kind === 'asset' ? vault.getResource(id) : undefined;
      if (!entity && !asset) return false;
      const archived = () => {
        if (kind === 'asset') {
          const live = vault.getResource(id);
          return live ? vault.isResourceEffectivelyArchived(live) : undefined;
        }
        const live = kind === 'page' ? vault.getPage(id) : vault.getFolder(id);
        return live ? membershipSelector.isEntityEffectivelyArchived(live) : undefined;
      };
      switch (action) {
        case 'archive':
          if (archived() !== false) return false;
          if (kind === 'page') await pageOperations.archive(id);
          else if (kind === 'folder') await folderOperations.archive(id);
          else await resourceOperations.archiveResource(id);
          return archived() === true;
        case 'restore':
          if (archived() !== true) return false;
          if (kind === 'page') {
            if ((await pageOperations.restore(id)).status !== 'restored') return false;
          } else if (kind === 'folder') await folderOperations.restore(id);
          else await resourceOperations.restoreResource(id);
          return archived() === false;
        case 'delete':
          if (archived() !== true) return false;
          if (kind === 'page') await pageOperations.delete(id);
          else if (kind === 'folder') await folderOperations.delete(id);
          else await resourceOperations.deleteResource(id);
          return kind === 'page' ? !vault.getPage(id) : kind === 'folder' ? !vault.getFolder(id) : !vault.getResource(id);
        case 'move':
          if (destination === undefined) return false;
          if (kind === 'page') await pageOperations.move(id, destination);
          else if (kind === 'folder') await folderOperations.move(id, destination);
          else await resourceOperations.moveResource(id, destination);
          return true;
        case 'favorite':
        case 'unfavorite': {
          const favorite = action === 'favorite';
          if (kind === 'asset') return false;
          if (kind === 'page') await pageOperations.updateMetadata(id, { favorite });
          else await folderOperations.updateMetadata(id, { favorite });
          return true;
        }
      }
    },
  };
}

const verbs: Record<SelectionBatchAction, string> = {
  archive: 'archive', restore: 'restore', delete: 'delete', move: 'move',
  favorite: 'add to favorites', unfavorite: 'remove from favorites',
};

function failureText(action: SelectionBatchAction, failed: number, total: number): string {
  const subject = failed === total ? (total === 1 ? 'this item' : 'these items') : `${failed} of ${total} items`;
  if (action === 'favorite') return `Couldn’t add ${subject} to favorites`;
  if (action === 'unfavorite') return `Couldn’t remove ${subject} from favorites`;
  return `Couldn’t ${verbs[action]} ${subject}`;
}

/** One batch-scoped outcome, never global toast suppression. Undo affects only completed archives. */
export async function runSelectionBatch(
  toast: ToastApi,
  action: SelectionBatchAction,
  items: readonly SelectionBatchItem[],
  destination?: string | null
): Promise<void> {
  if (items.length === 0) return;
  const completed: SelectionBatchItem[] = [];
  const errors: unknown[] = [];
  for (const item of items) {
    try {
      if (await item.run(action, destination)) completed.push(item);
    } catch (error) {
      errors.push(error);
    }
  }
  const failed = items.length - completed.length;
  const undo = action === 'archive' && completed.length > 0 ? {
    label: 'Undo',
    onAction: () => { void runSelectionBatch(toast, 'restore', [...completed].reverse()); },
  } : undefined;
  if (failed) {
    const message = failureText(action, failed, items.length) +
      (action === 'restore' ? '. Restore the remaining items individually from Archive' : '');
    if (undo) {
      if (errors.length) console.error(message, errors);
      toast.show({ text: message, tone: 'error', action: undo });
    } else {
      toast.fail(message, errors.length ? errors : undefined);
    }
  } else if (undo) {
    toast.show({ text: `${completed.length} item${completed.length === 1 ? '' : 's'} archived`, action: undo });
  }
  // Successful restore, move, delete and favorites are visible in the collection and remain silent.
}
