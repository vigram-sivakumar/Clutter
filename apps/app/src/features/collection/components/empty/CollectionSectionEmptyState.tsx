import type { CollectionEmptyAction } from './CollectionEmptyState';
import './CollectionSectionEmptyState.css';

export interface CollectionSectionEmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: CollectionEmptyAction;
}

/**
 * What ONE section of a collection shows when it has no items while the collection as a whole
 * does ("No folders yet" under a list of notes): a compact, left-aligned block in the section's
 * own place. Not the whole-collection empty state — the rest of the collection is drawn as
 * normal. A generic placeholder; the copy and the action come from the page.
 */
export function CollectionSectionEmptyState({ title, description, action }: CollectionSectionEmptyStateProps) {
  return (
    <div className="collection-section-empty">
      <span className="collection-section-empty__title">{title}</span>
      {description && <span className="collection-section-empty__description">{description}</span>}
      {action && (
        <button type="button" className="collection-section-empty__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
