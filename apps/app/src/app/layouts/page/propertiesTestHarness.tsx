import { useState } from 'react';

import { PropertyList } from '@components/property-list/PropertyList';
import type { MultiSelectSuggestion } from '@components/property-list/PropertyList.types';
import type { CustomPropertyType } from '@core/properties/Property.types';
import {
  emptyCustomProperty,
  removeCustomListItem,
  renameCustomProperty,
  setCustomListValue,
  setCustomScalarValue,
} from '@core/vault/ingest/frontmatter/customFrontmatter';
import {
  addCustomPropertyLines,
  addSystemPropertyLines,
  deleteAllPropertiesLines,
  deleteCustomPropertyLines,
  removeSystemPropertyLines,
  setSectionHiddenLines,
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
 * `onLines` receives every new set of preserved frontmatter lines; the page's
 * own `tags` and `aliases` are held in state, since they are owned metadata
 * and never written through those lines.
 */
export function PropertiesHarness({
  initial = [],
  tags: initialTags = ['work', 'home'],
  aliases: initialAliases = ['Alt'],
  status = 'active',
  aliasSuggestions,
  onLines,
}: {
  initial?: readonly string[];
  tags?: string[];
  aliases?: string[];
  status?: 'active' | 'archived';
  /** The Aliases editor's autocomplete source (PageHost passes createAliasSuggester). */
  aliasSuggestions?(query: string): readonly MultiSelectSuggestion[];
  onLines?(lines: readonly string[]): void;
}) {
  const [lines, setLinesState] = useState<readonly string[]>(initial);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const [isStarting, setIsStarting] = useState(false);
  const drafts = useCustomPropertyDrafts('p1');

  const write = (next: readonly string[] | null) => {
    if (next === null) {
      return;
    }

    setLinesState(next);
    onLines?.(next);
  };

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
    onRenameProperty: (key, name) => write(renameCustomProperty(lines, key, name)),
    onRemoveListItem: (key, index, value) => write(removeCustomListItem(lines, key, index, value)),
    onCommitListValue: (key, value) => write(setCustomListValue(lines, key, value)),
    onSetScalarValue: (key, type, value) => write(setCustomScalarValue(lines, key, type, value)),
    onDeleteProperty: (key) => write(deleteCustomPropertyLines(lines, key)),
    onRemoveSystemProperty: (key) => write(removeSystemPropertyLines(lines, key)),
    drafts: {
      items: drafts.drafts,
      onName: (id, name) => {
        const draft = drafts.drafts.find((candidate) => candidate.id === id)!;
        write(addCustomPropertyLines(lines, name, emptyCustomProperty(draft.type)));
        drafts.remove(id);
      },
      onAbandon: drafts.remove,
    },
  });

  const hideSection = () => {
    drafts.clear();
    setIsStarting(false);
    write(setSectionHiddenLines(lines, true));
  };
  const deleteAll = () => {
    drafts.clear();
    setIsStarting(false);
    write(deleteAllPropertiesLines(lines));
  };

  const control: PropertiesControl | undefined =
    section.control === 'add'
      ? { mode: 'add', onStart: () => setIsStarting(true) }
      : section.control === 'show'
        ? { mode: 'show', onShow: () => write(setSectionHiddenLines(lines, false)) }
        : undefined;

  return (
    <>
      <PageHeaderMoreActionsMenu hasCoverImage={false} propertiesControl={control} />
      {section.isDisplayed && (
        <PropertyList
          items={items}
          footer={
            section.showsAddRow ? (
              <AddPropertyRow
                systemProperties={getAddableSystemProperties(page)}
                autoOpen={isStarting}
                onDismiss={() => setIsStarting(false)}
                onAddSystemProperty={(key) => {
                  write(addSystemPropertyLines(lines, key));
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
