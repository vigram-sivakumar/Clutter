import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { MenuItem } from '@components/menu/MenuItem';
import { formatTagDisplayLabel, normalizeTagName, serializeTagName } from '@core/vault/models/Tag';
import { isValidTagName } from '@core/vault/ingest/tag/tagScanner';
import type { GetTagSuggestions } from '@features/markdown/editor/codemirror/tag/tagSuggestion';

import type { PropertyEditability } from './PropertyList.types';
import { Pill } from './Pill';
import { PillListEditor, usePillListEditor } from './PillListEditor';
import { PillValueEditor } from './PillValueEditor';
import { PropertyValueCell } from './PropertyValueCell';
import { useRejectShake } from './useRejectShake';

type TagPropertyValueProps = {
  /** The property's name — used only as the input's accessible label. */
  name: string;
  /** Tag names without their `#`, as frontmatter `tags` stores them. */
  value: readonly string[];
  /** Existing-tag search for autocomplete (see PropertyList.types). */
  getSuggestions?: GetTagSuggestions;
  /** Opens a tag's Tag Collection on pill click (see PropertyList.types). */
  onOpenTag?(name: string): void;
  /** Read-only: makes each pill dismissable (see PropertyList.types). */
  onRemoveValue?(index: number, value: string): void;
} & PropertyEditability<string[]>;

/**
 * Reads typed text as one tag name: an optional leading `#`, then a name (spaces
 * written as `-`) matching the editor's own tag grammar (`scanTag` — the same rule Vault
 * Ingest indexes inline `#tags` by), with nothing left over. Returns the
 * name without `#`, or null.
 */
export function parseTagInput(text: string): string | null {
  const trimmed = text.trim();
  // Spaces become `-`, the canonical separator — the same step the Tags sidebar's rename applies
  // (serializeTagName), so "Testing new tag" is the tag `Testing-new-tag`, shown as "Testing new tag".
  const name = serializeTagName(trimmed.replace(/^#\s*/, ''));
  return isValidTagName(name) ? name : null;
}

/** Whether `tags` already holds `name` under the tag identity rule (normalizeTagName). */
function hasTag(tags: readonly string[], name: string): boolean {
  const identity = normalizeTagName(name);
  return tags.some((tag) => normalizeTagName(tag) === identity);
}

/**
 * The `tag` Property's value — frontmatter tags only; inline `#tags` in the
 * body are never read or touched here. `editable` (supplied by the
 * adapter, never inferred here) picks the state: read-only renders the
 * pills (dismissable with `onRemoveValue`); editable renders the pills
 * plus an inline input.
 */
export function TagPropertyValue(props: TagPropertyValueProps) {
  if (!props.editable) {
    return (
      <PropertyValueCell>
        <span className="pill-list">
          {props.value.map((tag, index) => (
            <TagPill
              key={tag}
              tag={tag}
              onOpen={props.onOpenTag}
              onRemove={props.onRemoveValue && (() => props.onRemoveValue!(index, tag))}
            />
          ))}
        </span>
      </PropertyValueCell>
    );
  }

  return (
    <TagPropertyEditor
      name={props.name}
      value={props.value}
      getSuggestions={props.getSuggestions}
      onOpenTag={props.onOpenTag}
      onCommit={props.onCommit}
    />
  );
}

interface TagPillProps {
  tag: string;
  /** Click (or Enter/Space) on the pill opens the tag's Tag Collection. */
  onOpen?(name: string): void;
  /** Instead of `onOpen`: click (or Enter/Space) decides itself — edit the tag, or open it (see TagPropertyEditor). */
  onActivate?(): void;
  /** Accessible name of the pill-as-button, with `onActivate`. */
  /** Shows the hover dismiss button, which removes the tag. */
  activateLabel?: string;
  onRemove?(): void;
}

/**
 * One tag as a pill — the editor's inline tag look (same tokens, a dimmed
 * `#` prefix, `formatTagDisplayLabel` for the label), on the shared Pill.
 * With `onOpen`, the pill is a button opening the tag's Tag Collection.
 */
function TagPill({ tag, onOpen, onActivate, activateLabel, onRemove }: TagPillProps) {
  const content = (
    <>
      <span className="pill__prefix">#</span>
      {formatTagDisplayLabel(tag)}
    </>
  );

  if (onActivate) {
    return (
      <Pill onEdit={onActivate} label={activateLabel} onRemove={onRemove} removeLabel={`Remove tag ${tag}`}>
        {content}
      </Pill>
    );
  }

  return (
    <Pill
      onNavigate={onOpen && (() => onOpen(tag))}
      label={`Open tag ${tag}`}
      onRemove={onRemove}
      removeLabel={`Remove tag ${tag}`}
    >
      {content}
    </Pill>
  );
}

/**
 * Existing tags matching `query`, as names to store: the injected
 * suggester's results (normalized-identity search over vault tags, display
 * labels) serialized back with `serializeTagName` — the same label → name
 * step the editor's own tag autocomplete inserts with — minus any tag the
 * property already holds.
 */
function findSuggestions(
  getSuggestions: GetTagSuggestions | undefined,
  query: string,
  existing: readonly string[]
): string[] {
  const text = query.trim().replace(/^#/, '');

  if (!getSuggestions || text === '') {
    return [];
  }

  return getSuggestions(text)
    .map(serializeTagName)
    .filter((tag) => !hasTag(existing, tag));
}

/** DOM id of a suggestion row (useMenuKeyboard addresses rows by id), scoped per editor. */
function suggestionId(scope: string, tag: string): string {
  return `${scope}-tag-${normalizeTagName(tag).replace(/\s+/g, '-')}`;
}

interface TagPropertyEditorProps {
  name: string;
  value: readonly string[];
  getSuggestions?: GetTagSuggestions;
  onOpenTag?(name: string): void;
  /** Fired with the whole new tag list after each add or remove. */
  onCommit(value: string[]): void;
}

/**
 * Editable state: the pills, then an inline Input. Clicking anywhere in the
 * value focuses the input. Typing `#name` and pressing Enter turns it into a pill and leaves the
 * input ready for the next tag — Space does not commit, it is ordinary text (as in the Aliases editor),
 * and spaces in a committed name become `-`:
 * - whitespace-only text never makes a pill;
 * - an invalid name keeps the text and plays EditableText's reject shake;
 * - a name already present (by normalizeTagName) is dropped, not doubled;
 * - Backspace in an empty input removes the last pill;
 * - leaving the field adds a valid pending tag and discards an invalid one.
 *
 * While typing, existing tags matching the text (and not already present)
 * show in a popover under the value, as a menu: the `.menu` surface with
 * real MenuItem rows. `Menu` itself isn't used because it only handles
 * keys while it has focus, and here the input must keep it — so, as in
 * PickerList, the input drives useMenuKeyboard (the same hook `Menu`
 * runs on) and hands its state to the rows through MenuContext, exactly
 * what `Menu` provides them. Nothing starts highlighted; ArrowUp/Down (or
 * hover) highlight a suggestion, and Enter or a click adds it — with no
 * highlight, Enter adds exactly what was typed — a new tag if no existing one matches. Escape closes the popover until typing resumes.
 */
function TagPropertyEditor({
  name,
  value,
  getSuggestions,
  onOpenTag,
  onCommit,
}: TagPropertyEditorProps) {
  const editor = usePillListEditor();
  const { draft, setDraft, isFocused, isDismissed, keyboard, idScope } = editor;
  const { shakeClassName, shake } = useRejectShake();
  // The pill being edited in place, by index, or null.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const suggestions = useMemo(
    () => findSuggestions(getSuggestions, draft, value),
    [getSuggestions, draft, value]
  );
  const isSuggesting = isFocused && !isDismissed && suggestions.length > 0;

  function addTag(tag: string) {
    if (!hasTag(value, tag)) {
      onCommit([...value, tag]);
    }
    setDraft('');
  }

  /** Turns the draft into a pill if it can be one; returns false if it was rejected as invalid. */
  function commitDraft(): boolean {
    if (draft.trim() === '') {
      setDraft('');
      return true;
    }

    const tag = parseTagInput(draft);

    if (tag === null) {
      return false;
    }

    addTag(tag);
    return true;
  }

  function removeTag(tag: string) {
    onCommit(value.filter((existing) => existing !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (isSuggesting && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      keyboard.handleKeyDown(event as unknown as KeyboardEvent<HTMLDivElement>);
      return;
    }

    if (event.key === 'Enter' && isSuggesting && keyboard.activeId) {
      event.preventDefault();
      const active = suggestions.find((tag) => suggestionId(idScope, tag) === keyboard.activeId);
      if (active) {
        addTag(active);
        return;
      }
    }

    // Only Enter commits (as in the Aliases editor): Space is ordinary text, left to the input; the
    // spaces in what Enter commits become `-` (parseTagInput).
    if (event.key === 'Enter') {
      event.preventDefault();

      if (!commitDraft()) {
        shake();
      }
      return;
    }

    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      removeTag(value[value.length - 1]!);
    }
  }

  function handleBlur() {
    if (!commitDraft()) {
      setDraft('');
    }
  }

  return (
    <PillListEditor
      name={name}
      editor={editor}
      isEmpty={value.length === 0}
      isSuggesting={isSuggesting}
      className={shakeClassName}
      menuLabel="Tag suggestions"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      pills={value.map((tag, index) =>
        index === editingIndex ? (
          <PillValueEditor
            key={`${index}-${tag}`}
            value={tag}
            parse={parseTagInput}
            isTaken={(candidate) =>
              hasTag(
                value.filter((_, otherIndex) => otherIndex !== index),
                candidate
              )
            }
            onCommit={(next) => {
              setEditingIndex(null);
              onCommit(value.map((existing, existingIndex) => (existingIndex === index ? next : existing)));
            }}
            onCancel={() => setEditingIndex(null)}
          />
        ) : (
          <TagPill
            key={`${index}-${tag}`}
            tag={tag}
            // While the field is being edited a click edits the tag, as an alias does; otherwise it
            // opens the tag's collection (and, with no way to open one, edits).
            onActivate={() =>
              editor.shouldEditPill() || !onOpenTag ? setEditingIndex(index) : onOpenTag(tag)
            }
            activateLabel={editor.isEditing || !onOpenTag ? `Edit tag ${tag}` : `Open tag ${tag}`}
            onRemove={() => removeTag(tag)}
          />
        )
      )}
      suggestionRows={suggestions.map((tag) => {
        const id = suggestionId(idScope, tag);
        return (
          <MenuItem key={id} id={id} tabIndex={-1} onClick={() => addTag(tag)}>
            <span className="property-list__tag-suggestion">
              <span className="pill__prefix">#</span>
              {formatTagDisplayLabel(tag)}
            </span>
          </MenuItem>
        );
      })}
    />
  );
}
