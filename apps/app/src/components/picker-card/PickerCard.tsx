import { Button } from '@components/button/Button';
import { PickerList } from '@components/picker-list/PickerList';
import type { PickerListItem } from '@components/picker-list/PickerList.types';
import { AppIcon, type SystemIcon } from '@shared/icon';

import './PickerCard.css';

export interface PickerCardProps {
  /** The card's heading, e.g. "Set cover image" or "Move to". */
  readonly title: string;
  /** The dismiss (×) button. Escape and outside click are the host overlay's own. */
  readonly onClose: () => void;
  readonly items: PickerListItem[];
  readonly placeholder?: string;
  /** The leading icon for an item that has no `icon` of its own. */
  readonly leadingIcon: SystemIcon;
  /** Caps each section (see `PickerListItem.section`) at this many rows, with Show more / Show less. */
  readonly sectionLimit?: number;
  /** Pass false for a single section that needs the cap but no heading. Default true. */
  readonly showSectionTitles?: boolean;
  readonly onSelect: (item: PickerListItem) => void;
  readonly onCreate?: (name: string) => void;
}

/**
 * The one "pick an item from a searchable, flat list" card: a heading with a dismiss button, a
 * search box, and a PickerList list — flat rows with each item's folder path under its title,
 * optional titled sections, a scrollbar in the card's padding and a fade where there is more to
 * scroll to. It draws only the card; the host decides how it is shown (a centered Overlay for the
 * cover picker, a Popover anchored to the trigger for Move) and what choosing an item does.
 */
export function PickerCard({
  title,
  onClose,
  items,
  placeholder,
  leadingIcon,
  sectionLimit,
  showSectionTitles,
  onSelect,
  onCreate,
}: PickerCardProps) {
  const sectioned = items.some((item) => item.section !== undefined);

  return (
    <div className={['picker-card', sectioned && 'picker-card--sectioned'].filter(Boolean).join(' ')}>
      <span className="picker-card__header">
        {title}
        <Button isIconOnly size="small" interaction="subtle" aria-label="Dismiss" onClick={onClose}>
          <AppIcon icon="dismiss" />
        </Button>
      </span>
      <PickerList
        items={items}
        placeholder={placeholder}
        leadingIcon={leadingIcon}
        showPath
        sectionLimit={sectionLimit}
        showSectionTitles={showSectionTitles}
        onSelect={onSelect}
        onCreate={onCreate}
      />
    </div>
  );
}
