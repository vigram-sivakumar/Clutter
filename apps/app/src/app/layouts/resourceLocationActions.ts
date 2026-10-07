import type { Vault } from '@core/vault/models/Vault';
import { downloadResource } from '@shared/helpers/downloadResource';
import { createLocationActions } from '@features/notes/helpers/createLocationActions';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

/**
 * The by-id resource (asset) flavor of the shared location actions
 * (`createLocationActions`) plus Download — used by `AppLayout`'s resource overlay More Actions and
 * `PageHost`'s `MarkdownEditor`/Assets-row wiring. Reveal and Copy path themselves have one
 * implementation, in `createLocationActions`, for every resource kind.
 */
export function createResourceLocationActions(vault: Vault) {
  const location = createLocationActions(vault.root);

  function revealResourceInFinder(resourceId: string): void {
    location.reveal(vault.getResource(resourceId)?.path);
  }

  function copyResourcePath(resourceId: string, format: LocationPathFormat): void {
    location.copyPath(vault.getResource(resourceId), 'resource', format);
  }

  function downloadResourceById(resourceId: string): void {
    const resource = vault.getResource(resourceId);
    if (resource) {
      void downloadResource(resource.path, resource.name);
    }
  }

  return { revealResourceInFinder, copyResourcePath, downloadResourceById };
}
