import { AppIcon } from '@shared/icon';
import { CollectionCard } from '@features/collection/components/card/CollectionCard';

/**
 * The collection's one Create affordance, in every layout — a trailing row in a List or a Table,
 * an empty "+" card in a Card grid. Always the generic label "Create": which kind of thing gets
 * created (a note, an imported file) is decided entirely by the handler the page binds, so no
 * layout and no generic component ever knows. The header "+" calls the same handler.
 */
export const CREATE_LABEL = 'Create';

/** The `newItem` a generic List or Table takes, or `undefined` when the collection cannot create. */
export function createNewItem(onCreate: (() => void) | undefined) {
  return onCreate ? { label: CREATE_LABEL, onClick: onCreate } : undefined;
}

/** The trailing "+" card of a Card grid. `aspectRatio` is the grid's own card shape. */
export function CreateCard({ onCreate, aspectRatio }: { onCreate: () => void; aspectRatio?: string }) {
  return (
    <CollectionCard isEmpty aspectRatio={aspectRatio} aria-label={CREATE_LABEL} onClick={onCreate}>
      <AppIcon icon="plus" />
    </CollectionCard>
  );
}
