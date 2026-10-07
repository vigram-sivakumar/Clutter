import { Entry } from './Entry';
import { AppIcon } from '@shared/icon';
import './ShowMoreEntry.css';

export interface ShowMoreEntryProps {
  /** How many rows are hidden while collapsed. */
  readonly hiddenCount: number;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  /** Tree indent, in the same levels every Entry uses — match the rows it caps. */
  readonly level?: number;
}

/**
 * The row that ends a capped list: "N more" while collapsed, "Show less" once expanded, both with the
 * horizontal three-dots icon. A plain Entry — normal row size, tertiary foreground — shared by every sidebar list that caps
 * its rows (Tasks groups, Notes folders).
 */
export function ShowMoreEntry({ hiddenCount, isExpanded, onToggle, level }: ShowMoreEntryProps) {
  return (
    <Entry
      className="show-more-entry"
      level={level}
      leading={<AppIcon icon="moreHorizontal" />}
      onClick={onToggle}
    >
      {isExpanded ? 'Show less' : `${hiddenCount} more`}
    </Entry>
  );
}
