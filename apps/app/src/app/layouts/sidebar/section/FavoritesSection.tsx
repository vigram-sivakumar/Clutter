import { Section, type SectionProps } from './Section';

export interface FavoritesSectionProps extends SectionProps {
  // Whether the underlying favorites collection (whatever kind of item —
  // notes/folders, tags, anything else that gains favoriting later) is
  // empty. Computed by the caller from its own data, since what counts as
  // "empty" differs per consumer — this component only owns what happens
  // once that's known.
  isEmpty: boolean;
}

/**
 * Renders nothing when there is nothing to favorite, instead of an empty,
 * header-only Section — shared by every sidebar with a Favorites group
 * (Notes, Tags, and any future one) so "hide Favorites when it's empty" is
 * one behavior with one implementation, not a per-sidebar special case
 * that can drift or be forgotten at a new call site.
 */
export function FavoritesSection({
  isEmpty,
  children,
  ...sectionProps
}: FavoritesSectionProps) {
  if (isEmpty) {
    return null;
  }

  return (
    <Section hasHeader {...sectionProps}>
      {children}
    </Section>
  );
}
