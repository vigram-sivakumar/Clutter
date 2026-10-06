import './CollectionEmptyState.css';

export interface CollectionEmptyStateProps {
  /** What the empty collection says. Absent, the generic line. */
  readonly message?: string;
}

/**
 * What a collection with no items at all shows in place of its List, Table or Card: one quiet,
 * centered line. A generic placeholder — it knows nothing about what the collection holds, and
 * its visual design is a separate, later piece of work.
 */
export function CollectionEmptyState({ message = 'Nothing here yet' }: CollectionEmptyStateProps) {
  return (
    <div className="collection-empty-state" role="status">
      {message}
    </div>
  );
}
