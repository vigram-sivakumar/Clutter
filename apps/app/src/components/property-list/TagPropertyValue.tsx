import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { MenuItem } from '@components/menu/MenuItem';
import { formatTagDisplayLabel, normalizeTagName, serializeTagName } from '@core/vault/models/Tag';
import { isValidTagName } from '@core/vault/ingest/tag/tagScanner';
import { useShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';
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
  /** A tag's assigned emoji, shown in place of its `#` (see PropertyList.types). */
  getTagIcon?(name: string): string | undefined;
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
  // The Show tag emojis setting: off, no pill gets an emoji (the lookup is simply not used), so each keeps its `#`. Read
  // here, so a change in Settings reaches an open editor at once.
  const showTagEmojis = useShowTagEmojis();
  const getTagIcon = showTagEmojis ? props.getTagIcon : undefined;

  if (!props.editable) {
    return (
      <PropertyValueCell>
        <span className="pill-list">
          {props.value.map((tag, index) => (
            <Pill
              size="small"
              key={tag}
              onNavigate={props.onOpenTag && (() => props.onOpenTag!(tag))}
              label={`Open tag ${tag}`}
              onRemove={props.onRemoveValue && (() => props.onRemoveValue!(index, tag))}
              removeLabel={`Remove tag ${tag}`}
            >
              {tagPrefix(getTagIcon?.(tag))}
              {formatTagDisplayLabel(tag)}
            </Pill>
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
      getTagIcon={getTagIcon}
      onCommit={props.onCommit}
    />
  );
}

/**
 * What comes before a tag's name on its pill: the dimmed `#`, or — for a tag with an assigned emoji — that emoji in its
 * place, as plain text at full strength (not an icon).
 */
function tagPrefix(emoji: string | undefined) {
  return emoji ? (
    <span className="pill__prefix pill__prefix--emoji">{emoji}</span>
  ) : (
    <span className="pill__prefix">#</span>
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

  if (!getSuggestions) {
    return [];
  }

  // Nothing typed lists every tag (the suggester treats an empty query as a match for all), so a focused empty
  // field already offers them; typing then narrows the list.
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
  getTagIcon?(name: string): string | undefined;
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
 * While the field is focused, existing tags matching the text — every tag when nothing is typed — (and not already
 * present) show in a popover under the value, as a menu: the `.menu` surface with
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
  getTagIcon,
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
      releaseFocusOnBlur
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
          <Pill
            size="small"
            key={`${index}-${tag}`}
            // While the field is being edited a click edits the tag, as an alias does; otherwise it
            // opens the tag's collection (and, with no way to open one, edits).
            onEdit={() =>
              editor.shouldEditPill() || !onOpenTag ? setEditingIndex(index) : onOpenTag(tag)
            }
            label={editor.isEditing || !onOpenTag ? `Edit tag ${tag}` : `Open tag ${tag}`}
            onRemove={() => removeTag(tag)}
            removeLabel={`Remove tag ${tag}`}
          >
            {tagPrefix(getTagIcon?.(tag))}
            {formatTagDisplayLabel(tag)}
          </Pill>
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
