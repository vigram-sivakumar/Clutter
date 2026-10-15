import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { EditableText } from '@components/editable-text/EditableText';
import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import {
  createDragAutoScroller,
  findScrollContainer,
  usePointerDrag,
} from '@shared/interaction';
import { DragGhost } from '@components/drag-ghost/DragGhost';
import { DropFeedback } from '@components/drag-ghost/DropFeedback';

import type { PropertyListItem } from './PropertyList.types';
import { PropertyMenu } from './PropertyMenu';
import {
  propertyTypeRegistry,
  renderPropertyValue,
} from './propertyTypeRegistry';

import './PropertyList.css';

interface PropertyListProps {
  items: PropertyListItem[];
  className?: string;
  /**
   * A row (or rows) after the last Property — the host's "add" affordance.
   * Rendered in the list's own layout (give it the `property-list__row`
   * classes), and keeps the list on screen even when there are no
   * Properties yet.
   */
  footer?: ReactNode;
  /**
   * Persists a new order: the `orderKey`s of the reorderable rows (those that have one), in their new
   * sequence, and the `orderKey` of the row that moved. Present: a row can be dragged by its label, and its menu offers Move up / Move down — both
   * end here. Absent (a read-only list): rows don't move.
   */
  onReorder?(orderKeys: string[], movedKey: string): void;
}

/** Where a drop would land among the reorderable rows: before row `index` (`rows.length` = after the last). */
interface InsertionTarget {
  readonly index: number;
  readonly line: { y: number; left: number; width: number };
}

const ROW_SELECTOR = '[data-property-orderable="true"]';

export type { PropertyListItem };

export function PropertyList({
  items,
  className,
  footer,
  onReorder,
}: PropertyListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<InsertionTarget | null>(null);
  const targetRef = useRef<InsertionTarget | null>(null);
  const keys = items.flatMap((item) =>
    item.orderKey !== undefined ? [item.orderKey] : []
  );
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // Row `from` moved to sit before slot `to` (0..n) — the one reordering drag and Move up/down share.
  const reorder = (from: number, to: number): void => {
    const next = [...keysRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, moved!);
    onReorderRef.current?.(next, moved!);
  };

  const { drag, press } = usePointerDrag<{ orderKey: string }>({
    onRelease: ({ orderKey }) => {
      const dropped = targetRef.current;
      targetRef.current = null;
      setTarget(null);
      const from = keysRef.current.indexOf(orderKey);

      if (dropped && from !== -1) {
        reorder(from, dropped.index);
      }
    },
    onCancel: () => {
      targetRef.current = null;
      setTarget(null);
    },
  });

  // While dragging, the insertion slot follows the pointer: before the first reorderable row whose middle
  // is below it, else after the last. A slot that would leave the row where it is isn't offered.
  useEffect(() => {
    if (!drag) {
      return;
    }

    const { session, payload } = drag;
    const update = () => {
      const list = listRef.current;
      const rows = list
        ? Array.from(list.querySelectorAll<HTMLElement>(ROW_SELECTOR))
        : [];
      const from = keysRef.current.indexOf(payload.orderKey);
      let index = rows.findIndex((row) => {
        const rect = row.getBoundingClientRect();
        return session.pointer.y < rect.top + rect.height / 2;
      });
      index = index === -1 ? rows.length : index;

      if (
        !list ||
        rows.length === 0 ||
        from === -1 ||
        index === from ||
        index === from + 1
      ) {
        targetRef.current = null;
        setTarget(null);
        return;
      }

      const bounds = list.getBoundingClientRect();
      const anchor = (
        index < rows.length ? rows[index]! : rows[rows.length - 1]!
      ).getBoundingClientRect();
      const next: InsertionTarget = {
        index,
        line: {
          y: index < rows.length ? anchor.top : anchor.bottom,
          left: bounds.left,
          width: bounds.width,
        },
      };
      const previous = targetRef.current;

      targetRef.current = next;
      if (
        !previous ||
        previous.index !== next.index ||
        previous.line.y !== next.line.y
      ) {
        setTarget(next);
      }
    };

    // Near the top or bottom of whatever scrolls the page, it scrolls toward the pointer.
    const container = findScrollContainer(session.source);
    const scroller = container
      ? createDragAutoScroller(container, () => session.pointer, update)
      : null;

    update();
    const unsubscribe = session.subscribe(() => {
      update();
      scroller?.poke();
    });
    document.addEventListener('scroll', update, true);

    return () => {
      unsubscribe();
      document.removeEventListener('scroll', update, true);
      scroller?.stop();
      targetRef.current = null;
    };
  }, [drag]);

  if (items.length === 0 && !footer) {
    return null;
  }

  const classes = ['property-list', className].filter(Boolean).join(' ');
  const canReorder = onReorder !== undefined;

  return (
    <div className={classes} ref={listRef}>
      {items.map((item, index) => {
        const orderKey = canReorder ? item.orderKey : undefined;
        const slot = orderKey !== undefined ? keys.indexOf(orderKey) : -1;

        return (
          // The row's stable id, not its position or name (both change when rows move).
          <div
            key={item.id ?? `${index}-${item.name}`}
            className={[
              'property-list__row',
              drag &&
                drag.payload.orderKey === orderKey &&
                'entry--drag-source',
            ]
              .filter(Boolean)
              .join(' ')}
            data-property-orderable={
              orderKey !== undefined ? 'true' : undefined
            }
            // A drag starts from the row's label only: values, the menu button and other nested controls
            // keep their own pointer behavior, and a label being edited is left to the editor.
            onPointerDown={
              orderKey === undefined
                ? undefined
                : (event) => {
                    const label = (event.target as HTMLElement).closest(
                      '.property-list__name'
                    );
                    const editor = (event.target as HTMLElement).closest(
                      '[role="textbox"]'
                    );

                    if (
                      !label ||
                      (editor && editor.contains(document.activeElement))
                    ) {
                      return;
                    }

                    press(event, { orderKey });
                  }
            }
          >
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
                  {(item.onClear ||
                    item.onRemove ||
                    item.onDelete ||
                    (canReorder && item.orderKey !== undefined)) && (
                    <PropertyMenu
                      name={item.name}
                      actions={{
                        onClear: item.onClear,
                        onRemove: item.onRemove,
                        onDelete: item.onDelete,
                      }}
                      move={
                        orderKey !== undefined
                          ? {
                              up:
                                slot > 0 ? () => reorder(slot, slot - 1) : null,
                              down:
                                slot < keys.length - 1
                                  ? () => reorder(slot, slot + 2)
                                  : null,
                            }
                          : undefined
                      }
                    />
                  )}
                </>
              }
            >
              <PropertyName item={item} />
            </Entry>

            {renderPropertyValue(item)}
          </div>
        );
      })}
      {footer}
      {drag && <DragGhost session={drag.session} />}
      {target && <DropFeedback shape={{ kind: 'insert', line: target.line }} />}
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
    return <span className="truncate">{item.name}</span>;
  }

  const isNew = Boolean(item.onAbandon);

  return (
    <EditableText
      className="editable-text--nowrap property-list__name-input"
      value={item.name}
      placeholder={isNew ? 'Property name' : undefined}
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
