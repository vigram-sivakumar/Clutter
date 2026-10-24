import { forwardRef, type ReactNode } from 'react';
import type { SystemIcon } from '@shared/icon';
import { AppIcon } from '@shared/icon';
import { Pill } from '@components/property-list/Pill';
import { Entry, type EntryProps } from './Entry';
import './SearchEntry.css';

export interface SearchEntryProps extends Omit<EntryProps, 'children' | 'leading' | 'trailing' | 'actions' | 'level'> {
  /** The leading icon, or — when `emoji` is set — the emoji shown in its place. */
  readonly icon: SystemIcon;
  readonly emoji?: string | null;
  readonly title: string;
  /** Small pills beside the title: what kind of thing this is (Template, PDF, …), the alias it was found by. */
  readonly pills?: readonly SearchEntryPill[];
  /** Small muted labels after the title ("Draft", "Close match", the tags that matched). */
  readonly badges?: readonly string[];
  /** Where the item lives, muted, under the title ("Work / Plans"). */
  readonly path?: string;
  /** One line of the matching text, cut off with an ellipsis at the right edge. */
  readonly excerpt?: string;
  /** A muted line after the excerpt ("2 more matches"). */
  readonly more?: string;
  /** Ranges of `title` that matched the query, shown in the code color (see `.search-entry__match`). */
  readonly titleMatches?: readonly SearchEntryRange[];
  /** Ranges of `excerpt` that matched the query. */
  readonly excerptMatches?: readonly SearchEntryRange[];
}

export interface SearchEntryPill {
  readonly label: string;
  /** Ranges of `label` that matched the query. */
  readonly matches?: readonly SearchEntryRange[];
}

export interface SearchEntryRange {
  readonly from: number;
  readonly to: number;
}

/** `text` with the given (sorted, non-overlapping) ranges wrapped in `<mark>`. */
function withMatches(text: string, ranges: readonly SearchEntryRange[] | undefined): ReactNode {
  if (!ranges || ranges.length === 0) {
    return text;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.from > cursor) {
      parts.push(text.slice(cursor, range.from));
    }

    parts.push(
      <mark key={index} className="search-entry__match">
        {text.slice(range.from, range.to)}
      </mark>
    );
    cursor = range.to;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

/**
 * A search result row: an `Entry` with three levels — the title (and any badges), the muted location, and a short
 * one-line excerpt. Presentational only: it knows nothing about what was searched or matched.
 *
 * The excerpt is `.search-entry__excerpt`, so a host can tell a click on it from a click on the rest of the row.
 */
export const SearchEntry = forwardRef<HTMLDivElement, SearchEntryProps>(function SearchEntry(
  { icon, emoji, title, pills = [], badges = [], path, excerpt, more, titleMatches, excerptMatches, className, ...entryProps },
  ref
) {
  return (
    <Entry
      {...entryProps}
      ref={ref}
      className={['search-entry', className].filter(Boolean).join(' ')}
      leading={
        <span className="search-entry__leading">
          <AppIcon className="search-entry__icon" icon={icon} emoji={emoji} />
        </span>
      }
    >
      <div className="search-entry__content">
        <div className="search-entry__title-row">
          <span className="search-entry__title truncate">{withMatches(title, titleMatches)}</span>
          {pills.map((pill) => (
            <Pill key={pill.label} size="small">
              {withMatches(pill.label, pill.matches)}
            </Pill>
          ))}
          {badges.map((badge) => (
            <span key={badge} className="search-entry__meta truncate">
              {badge}
            </span>
          ))}
        </div>
        {path && <span className="search-entry__path truncate">{path}</span>}
        {excerpt && <span className="search-entry__excerpt">{withMatches(excerpt, excerptMatches)}</span>}
        {more && <span className="search-entry__meta">{more}</span>}
      </div>
    </Entry>
  );
});
