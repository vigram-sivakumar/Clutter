import { revealInFinder } from '@shared/helpers/revealInFinder';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
import {
  getLocationPathRepresentations,
  pickLocationPathRepresentation,
  type LocationEntityKind,
  type LocationPathFormat,
} from '@core/presentation/getLocationPathRepresentations';

/**
 * The one implementation of the read-only location actions — "Reveal in Finder" and "Copy path" —
 * for every resource and every surface (sidebar rows, topbar, asset overlays). Look up the entity's
 * absolute path, then reveal it / pick the chosen representation and copy it. Never touches the
 * Gate or `Vault`; it only reads the entity it is handed and the vault's root.
 */
export function createLocationActions(vaultRoot: string) {
  function reveal(entityPath: string | undefined): void {
    if (entityPath) {
      void revealInFinder(entityPath);
    }
  }

  function copyPath(
    entity: { path: string } | undefined,
    kind: LocationEntityKind,
    format: LocationPathFormat
  ): void {
    if (!entity) {
      return;
    }

    const value = pickLocationPathRepresentation(
      getLocationPathRepresentations(entity, kind, vaultRoot),
      format
    );

    if (value !== null) {
      void copyTextToClipboard(value);
    }
  }

  return { reveal, copyPath };
}
