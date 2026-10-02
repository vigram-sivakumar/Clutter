import { useRef } from 'react';

import { EditableText } from '@components/editable-text/EditableText';
import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';

import type { PropertyListItem } from './PropertyList.types';
import { PropertyMenu } from './PropertyMenu';
import { propertyTypeRegistry, renderPropertyValue } from './propertyTypeRegistry';

import './PropertyList.css';

interface PropertyListProps {
  items: PropertyListItem[];
  className?: string;
}

export type { PropertyListItem };

export function PropertyList({ items, className }: PropertyListProps) {
  if (items.length === 0) {
    return null;
  }

  const classes = ['property-list', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {items.map((item, index) => (
        // Index too: a custom property may share a system Property's
        // label (a `Tags` key next to the system Tags).
        <div key={`${index}-${item.name}`} className="property-list__row">
          <Entry
            className="property-list__name"
            leading={
              <>
                <AppIcon
                  className="property__icon property__icon--type"
                  icon={propertyTypeRegistry[item.type].icon}
                />
                {/* Replaces the type icon while the name is hovered
                    (PropertyList.css) — only when there is something to do. */}
                {(item.onHide || item.onClear || item.onDelete) && (
                  <PropertyMenu
                    name={item.name}
                    actions={{ onHide: item.onHide, onClear: item.onClear, onDelete: item.onDelete }}
                  />
                )}
              </>
            }
          >
            <PropertyName item={item} />
          </Entry>

          {renderPropertyValue(item)}
        </div>
      ))}
    </div>
  );
}

/**
 * A Property's name: plain text, or — when the adapter allows renaming —
 * inline-editable text. A not-yet-named Property (`onAbandon`) is
 * focused on mount and reports an editing session that ended without a
 * committed name, so its row can be removed.
 */
function PropertyName({ item }: { item: PropertyListItem }) {
  const hasCommittedRef = useRef(false);

  if (!item.onRename) {
    return <span>{item.name}</span>;
  }

  const isNew = Boolean(item.onAbandon);

  return (
    <EditableText
      className="editable-text--nowrap property-list__name-input"
      value={item.name}
      placeholder={isNew ? 'Name' : undefined}
      autoFocus={isNew}
      onCommit={(name) => {
        const isAccepted = item.onRename!(name);

        if (isAccepted) {
          hasCommittedRef.current = true;
        }

        return isAccepted;
      }}
      onEditingEnd={() => {
        if (isNew && !hasCommittedRef.current) {
          item.onAbandon?.();
        }
      }}
    />
  );
}

PropertyList.displayName = 'PropertyList';
