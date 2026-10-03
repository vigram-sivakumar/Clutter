import { EditableText } from '@components/editable-text/EditableText';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { VaultResource } from '@core/vault/models/VaultResource';

export interface AssetRenameFieldProps {
  readonly resource: VaultResource;
  /** Commits the new (extension-free) name — `ResourceOperations.renameResource`, supplied by the caller. */
  readonly onCommit: (name: string) => void;
  readonly onEditingEnd: () => void;
}

/**
 * The inline rename editor an asset's title becomes while it is being renamed —
 * the same `EditableText`, seeded with the same extension-free display name,
 * that the asset row has always used. Passed as a `CollectionEntry`'s
 * `titleContent`, so list rows, table rows and cards all rename identically.
 */
export function AssetRenameField({ resource, onCommit, onEditingEnd }: AssetRenameFieldProps) {
  return (
    <EditableText
      value={getResourceDisplayName(resource)}
      className="editable-text--nowrap"
      autoFocus
      onCommit={onCommit}
      onEditingEnd={onEditingEnd}
    />
  );
}
