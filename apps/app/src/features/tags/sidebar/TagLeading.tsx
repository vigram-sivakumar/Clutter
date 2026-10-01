import { Caret } from '@components/caret/Caret';
import { AppIcon } from '@shared/icon';

interface TagLeadingProps {
  emoji?: string | null;
  isEmpty?: boolean;
  hasCaret?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
}

/**
 * The shared caret/icon leading-slot composition for a tag row — same
 * grid-overlay crossfade as FolderLeading (Tag.css's tag__caret/tag__icon
 * share one grid cell), so a tag row's disclosure control matches a
 * folder row's exactly rather than introducing a second implementation.
 */
export function TagLeading({
  emoji,
  isEmpty = false,
  hasCaret = true,
  isExpanded = false,
  onExpandToggle,
}: TagLeadingProps) {
  // A tag with no notes has nothing to expand into, so its caret must
  // always read as collapsed — same reasoning as FolderLeading's
  // identical guard for an empty folder.
  const visualIsExpanded = isEmpty ? false : isExpanded;

  return (
    <span className={`tag__leading${hasCaret ? ' tag__leading--has-caret' : ''}`}>
      {hasCaret && (
        <span className="tag__caret">
          <Caret
            disabled={isEmpty}
            isExpanded={visualIsExpanded}
            variant="tree"
            onClick={(event) => {
              event.stopPropagation();
              onExpandToggle?.();
            }}
          />
        </span>
      )}

      <AppIcon className="tag__icon" icon="tag" emoji={emoji} />
    </span>
  );
}
