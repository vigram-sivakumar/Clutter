import './CollectionEmptyState.css';

export interface CollectionEmptyAction {
  /** What the one call to action says — decided by the page ("Create note", "Add asset"), never by this component. */
  readonly label: string;
  readonly onClick: () => void;
}

export interface CollectionEmptyStateProps {
  /** What the empty collection says. Absent, the generic line. */
  readonly message?: string;
  /** An optional call to action. Absent, none is drawn. */
  readonly action?: CollectionEmptyAction;
}

/**
 * What a collection with no items at all shows in place of its List, Table or Card: one quiet,
 * centered line and, where the collection can add something, one call to action. A generic
 * placeholder — it knows nothing about what the collection holds or what the action creates, and
 * its visual design is a separate, later piece of work.
 */
export function CollectionEmptyState({ message = 'Nothing here yet', action }: CollectionEmptyStateProps) {
  return (
    <div className="collection-empty-state" role="status">
      <span>{message}</span>
      {action && (
        <button type="button" className="collection-empty-state__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
