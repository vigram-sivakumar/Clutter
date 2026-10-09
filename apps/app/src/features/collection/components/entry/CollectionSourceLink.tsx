import { AppIcon, type SystemIcon } from '@shared/icon';
import { CollectionEntryProperties } from './CollectionEntryProperties';

export interface CollectionSourceLinkProps {
  /** The note's display label. */
  readonly label: string;
  /** The note's own identity icon / emoji (as its sidebar row shows). */
  readonly icon: SystemIcon;
  readonly emoji: string | null;
  /** Opens the note. The click never reaches the row's own click handler. */
  readonly onOpen: () => void;
}

/**
 * The Source property's value — the note an item lives in — as the wiki-link-styled link the Task Collection has always
 * drawn: the note's icon or emoji, then its label underlined as a link. Shared by the Task Collection and the Tag
 * Collection so Source looks and behaves the same in both.
 */
export function CollectionSourceLink({ label, icon, emoji, onOpen }: CollectionSourceLinkProps) {
  return (
    <CollectionEntryProperties
      className="collection-entry-properties--wiki"
      role="link"
      aria-label={`Open ${label}`}
      leading={<AppIcon icon={icon} emoji={emoji} size={14} slotSize={16} />}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <span className="collection-entry-properties__text">{label}</span>
    </CollectionEntryProperties>
  );
}
