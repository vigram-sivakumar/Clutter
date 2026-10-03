import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

import { CollectionViewMenu, type CollectionViewMenuProps } from './CollectionViewMenu';

export interface CollectionHeaderActionsProps {
  /** The standard Configure control (Layout / Properties / Sort) — Settings and the view-mode control. */
  menu: CollectionViewMenuProps;
  /** The standard Add action. Absent -> no Add button (e.g. a collection that can't create items here). */
  onAdd?: () => void;
  /** Accessible label of the Add button — "New" for notes, "Add asset" for assets. */
  addLabel?: string;
}

/**
 * The one collection header-actions block: the Configure (Settings / view
 * mode) control followed by the primary Add button. Every collection type —
 * folders, Workspace/Favorites/Tags, Assets — renders this same component into
 * the page's `titleActions` slot, so the controls, their order and their look
 * are defined exactly once. A collection customizes what the controls *do*
 * (`menu.capabilities`, `onAdd`, `addLabel`), never which controls exist.
 */
export function CollectionHeaderActions({
  menu,
  onAdd,
  addLabel = 'New',
}: CollectionHeaderActionsProps) {
  return (
    <>
      <CollectionViewMenu {...menu} />
      {onAdd && (
        <Button isIconOnly variant="primary" aria-label={addLabel} onClick={onAdd}>
          <AppIcon icon="plus" />
        </Button>
      )}
    </>
  );
}
