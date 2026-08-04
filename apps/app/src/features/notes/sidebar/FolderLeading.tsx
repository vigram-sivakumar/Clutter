import { Caret } from '@components/caret/Caret';
import { AppIcon } from '@shared/icon';
import { getPageIcon } from '@core/presentation/getPageIcon';

interface FolderLeadingProps {
  emoji?: string | null;
  isEmpty?: boolean;
  hasCaret?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
}

/**
 * The shared caret/icon leading-slot composition for a folder row — the
 * grid overlay (folder__caret and folder__icon share one grid cell,
 * Folder.css crossfades between them on hover) only works when both are
 * rendered inside the exact folder__leading wrapper, so every folder-shaped
 * row (a real Folder, or the in-progress NewFolderRow) renders this instead
 * of reimplementing the caret+icon markup itself.
 */
export function FolderLeading({
  emoji,
  isEmpty = false,
  hasCaret = true,
  isExpanded = false,
  onExpandToggle,
}: FolderLeadingProps) {
  // An empty folder has nothing to expand into, so its caret must always
  // read as collapsed — regardless of whatever expand/collapse state
  // happens to be stored for its id (e.g. a brand-new folder defaults to
  // "expanded" per Workspace.isFolderExpanded, even though it has never
  // actually been toggled). This only changes which way the icon points;
  // onExpandToggle/disabled below are unaffected.
  const visualIsExpanded = isEmpty ? false : isExpanded;

  return (
    <span
      className={`folder__leading${hasCaret ? ' folder__leading--has-caret' : ''}`}
    >
      {hasCaret && (
        <span className="folder__caret">
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

      <span className="folder__icon">
        <AppIcon icon={getPageIcon('folder')} emoji={emoji} />
      </span>
    </span>
  );
}
