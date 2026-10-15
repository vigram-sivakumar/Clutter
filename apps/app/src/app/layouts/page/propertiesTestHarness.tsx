import { useState } from 'react';

import { PropertyList } from '@components/property-list/PropertyList';
import type { MultiSelectSuggestion } from '@components/property-list/PropertyList.types';
import type { CustomPropertyType } from '@core/properties/Property.types';
import {
  emptyCustomProperty,
  removeCustomListItem,
  setCustomListValue,
  setCustomScalarValue,
} from '@core/vault/ingest/frontmatter/customFrontmatter';
import {
  addCustomPropertyLines,
  addSystemPropertyLines,
  deleteAllPropertiesLines,
  deleteCustomPropertyLines,
  removeSystemPropertyLines,
  renameCustomPropertyLines,
  reorderPropertiesLines,
  setSectionHiddenLines,
  type PropertyFrontmatter,
} from '@core/vault/ingest/frontmatter/propertyLines';
import type { Page } from '@core/vault/models/Page';

import { getAddableSystemProperties } from './addableProperties';
import { AddPropertyRow } from './AddPropertyRow';
import { buildPageProperties } from './buildPageProperties';
import { PageHeaderMoreActionsMenu } from './header/PageHeaderMoreActionsMenu';
import type { PropertiesControl } from './header/propertiesControl';
import { derivePropertiesSectionState } from './propertiesSectionState';
import { useCustomPropertyDrafts } from './useCustomPropertyDrafts';

/**
 * The Properties UI wired the way PageHost wires it — the real title menu,
 * section state, adapter, PropertyList, picker and drafts — with the page
 * operations replaced by the *same pure frontmatter functions* PageOperations
 * writes through (propertyLines.ts / customFrontmatter.ts), applied to local
 * state. So an integration test here exercises one implementation of every
 * change, not a second copy of it. (PageHost's own Delete all confirmation
 * dialog is chrome around `deleteAll` and is not part of this harness.)
 *
 * `onLines` receives every new set of preserved frontmatter lines and
 * `onState` the whole state (lines and the physical entry order); the page's
 * own `tags` and `aliases` are held in state, since they are owned metadata
 * and never written through those lines. `initialOrder` is the file's entry
 * order (PageMetadata.frontmatterEntryOrder) — pass it to place system keys
 * among the custom ones, as a real note read from a file has.
 */
export function PropertiesHarness({
  initial = [],
  initialOrder,
  tags: initialTags = ['work', 'home'],
  aliases: initialAliases = ['Alt'],
  status = 'active',
  aliasSuggestions,
  onLines,
  onState,
}: {
  initial?: readonly string[];
  initialOrder?: readonly string[];
  tags?: string[];
  aliases?: string[];
  status?: 'active' | 'archived';
  /** The Aliases editor's autocomplete source (PageHost passes createAliasSuggester). */
  aliasSuggestions?(query: string): readonly MultiSelectSuggestion[];
  onLines?(lines: readonly string[]): void;
  onState?(state: PropertyFrontmatter): void;
}) {
  const [state, setState] = useState<PropertyFrontmatter>({ lines: initial, order: initialOrder });
  const { lines } = state;
  const [tags, setTags] = useState<string[]>(initialTags);
  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const [isStarting, setIsStarting] = useState(false);
  const drafts = useCustomPropertyDrafts('p1');

  const write = (next: PropertyFrontmatter | null) => {
    if (next === null) {
      return;
    }

    setState(next);
    onLines?.(next.lines);
    onState?.(next);
  };
  /** A change that only edits preserved lines: the entry order is as it was. */
  const writeLines = (next: readonly string[] | null) => write(next === null ? null : { lines: next, order: state.order });

  const page = {
    id: 'p1',
    type: 'note',
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      status,
      tags,
      aliases,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      unownedFrontmatter: lines,
      frontmatterEntryOrder: state.order,
    },
  } as unknown as Page;

  const section = derivePropertiesSectionState({
    lines,
    isArchived: status === 'archived',
    hasDraft: drafts.drafts.length > 0,
    isStarting,
  });

  const items = buildPageProperties(page, {
    isEffectivelyArchived: status === 'archived',
    onCommitTags: setTags,
    aliases: { onCommit: setAliases, getSuggestions: aliasSuggestions },
    onRenameProperty: (key, name) => write(renameCustomPropertyLines(state, key, name)),
    onRemoveListItem: (key, index, value) => writeLines(removeCustomListItem(lines, key, index, value)),
    onCommitListValue: (key, value) => writeLines(setCustomListValue(lines, key, value)),
    onSetScalarValue: (key, type, value) => writeLines(setCustomScalarValue(lines, key, type, value)),
    onDeleteProperty: (key) => write(deleteCustomPropertyLines(state, key)),
    onRemoveSystemProperty: (key) => write(removeSystemPropertyLines(state, key)),
    drafts: {
      items: drafts.drafts,
      onName: (id, name) => {
        const draft = drafts.drafts.find((candidate) => candidate.id === id)!;
        write(addCustomPropertyLines(state, name, emptyCustomProperty(draft.type)));
        drafts.remove(id);
      },
      onAbandon: drafts.remove,
    },
  });

  const hideSection = () => {
    drafts.clear();
    setIsStarting(false);
    write(setSectionHiddenLines(state, true));
  };
  const deleteAll = () => {
    drafts.clear();
    setIsStarting(false);
    write(deleteAllPropertiesLines(state));
  };

  const control: PropertiesControl | undefined =
    section.control === 'add'
      ? { mode: 'add', onStart: () => setIsStarting(true) }
      : section.control === 'show'
        ? { mode: 'show', onShow: () => write(setSectionHiddenLines(state, false)) }
        : undefined;

  return (
    <>
      <PageHeaderMoreActionsMenu hasCoverImage={false} propertiesControl={control} />
      {section.isDisplayed && (
        <PropertyList
          items={items}
          onReorder={status === 'archived' ? undefined : (keys, movedKey) => write(reorderPropertiesLines(state, keys, movedKey))}
          footer={
            section.showsAddRow ? (
              <AddPropertyRow
                systemProperties={getAddableSystemProperties(page)}
                autoOpen={isStarting}
                onDismiss={() => setIsStarting(false)}
                onAddSystemProperty={(key) => {
                  write(addSystemPropertyLines(state, key));
                  setIsStarting(false);
                }}
                onAddCustomProperty={(type: CustomPropertyType) => {
                  drafts.add(type);
                  setIsStarting(false);
                }}
                onHideProperties={section.hasProperties ? hideSection : undefined}
                onDeleteAll={section.hasProperties ? deleteAll : undefined}
              />
            ) : undefined
          }
        />
      )}
    </>
  );
}
