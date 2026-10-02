import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

import { Button } from '@components/button/Button';
import { Input } from '@components/input/Input';
import { MenuContext } from '@components/menu/Menu.context';
import { MenuItem } from '@components/menu/MenuItem';
import { useMenuKeyboard } from '@components/menu/useMenuKeyboard';
import { Popover } from '@components/popover/Popover';
import { formatTagDisplayLabel, normalizeTagName, serializeTagName } from '@core/vault/models/Tag';
import { scanTag } from '@features/markdown/editor/codemirror/tag/tagScanner';
import type { GetTagSuggestions } from '@features/markdown/editor/codemirror/tag/tagSuggestion';
import { AppIcon } from '@shared/icon';

import type { PropertyEditability } from './PropertyList.types';
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
} & PropertyEditability<string[]>;

/**
 * Reads typed text as one tag name: an optional leading `#`, then a name
 * matching the editor's own tag grammar (`scanTag` — the same rule Vault
 * Ingest indexes inline `#tags` by), with nothing left over. Returns the
 * name without `#`, or null.
 */
export function parseTagInput(text: string): string | null {
  const trimmed = text.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const match = scanTag(withHash, 0);
  return match && match.end === withHash.length ? match.name : null;
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
 * pills; editable renders the pills plus an inline input.
 */
export function TagPropertyValue(props: TagPropertyValueProps) {
  if (!props.editable) {
    return (
      <PropertyValueCell>
        <span className="property-list__tags">
          {props.value.map((tag) => (
            <TagPill key={tag} tag={tag} onOpen={props.onOpenTag} />
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
  /** Shows the hover dismiss button, which removes the tag. */
  onRemove?(): void;
}

/**
 * One tag as a pill — the editor's inline tag look (same tokens, a dimmed
 * `#` prefix, `formatTagDisplayLabel` for the label). Two interactions:
 * - with `onOpen`, the pill is a button opening the tag's Tag Collection;
 * - with `onRemove`, a dismiss button appears over the pill on hover,
 *   absolutely positioned so it never shifts the row, and removes the tag.
 * Neither click reaches the editor's "click anywhere to type" handler, and
 * the dismiss click never reaches the pill's own.
 */
function TagPill({ tag, onOpen, onRemove }: TagPillProps) {
  function handleRemove(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onRemove?.();
  }

  function handleOpen(event: MouseEvent<HTMLSpanElement>) {
    event.stopPropagation();
    onOpen?.(tag);
  }

  function handleOpenKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onOpen?.(tag);
  }

  return (
    <span
      className={['property-list__tag', onOpen && 'property-list__tag--link']
        .filter(Boolean)
        .join(' ')}
      // A <span>, not a <button>: it contains the dismiss <button>, and
      // buttons can't nest.
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Open tag ${tag}` : undefined}
      onClick={onOpen ? handleOpen : undefined}
      onKeyDown={onOpen ? handleOpenKeyDown : undefined}
    >
      <span className="property-list__tag-prefix">#</span>
      {formatTagDisplayLabel(tag)}
      {onRemove && (
        <Button
          className="property-list__tag-remove"
          isIconOnly
          variant="ghost"
          size="small"
          aria-label={`Remove tag ${tag}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleRemove}
        >
          <AppIcon icon="dismiss" />
        </Button>
      )}
    </span>
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
 * value focuses the input. Typing `#name` and pressing Space (or Enter)
 * turns it into a pill and leaves the input ready for the next tag:
 * - whitespace-only text never makes a pill (and Space isn't inserted);
 * - an invalid name keeps the text and plays EditableText's reject shake;
 * - a name already present (by normalizeTagName) is dropped, not doubled;
 * - Backspace in an empty input removes the last pill;
 * - leaving the field adds a valid pending tag and discards an invalid one.
 *
 * While typing, existing tags matching the text (and not already present)
 * show in a popover under the value, as a menu: the `.menu` surface with
 * real MenuItem rows. `Menu` itself isn't used because it only handles
 * keys while it has focus, and here the input must keep it — so, as in
 * FolderPicker, the input drives useMenuKeyboard (the same hook `Menu`
 * runs on) and hands its state to the rows through MenuContext, exactly
 * what `Menu` provides them. Nothing starts highlighted; ArrowUp/Down (or
 * hover) highlight a suggestion, and Enter or a click adds it — with no
 * highlight, Enter adds the typed text, like Space. Space always adds exactly what was typed — a new tag if no
 * existing one matches. Escape closes the popover until typing resumes.
 */
function TagPropertyEditor({
  name,
  value,
  getSuggestions,
  onOpenTag,
  onCommit,
}: TagPropertyEditorProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { shakeClassName, shake } = useRejectShake();
  // No preferredActiveId: nothing is highlighted until ArrowUp/Down or hover.
  const keyboard = useMenuKeyboard(listRef);
  const idScope = useId();

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

    if (event.key === ' ' || event.key === 'Enter') {
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
    setIsFocused(false);

    if (!commitDraft()) {
      setDraft('');
    }
  }

  return (
    <div
      className={['property-list__value property-list__tag-editor', shakeClassName]
        .filter(Boolean)
        .join(' ')}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <TagPill key={tag} tag={tag} onOpen={onOpenTag} onRemove={() => removeTag(tag)} />
      ))}
      <Input
        ref={inputRef}
        className="property-list__tag-input"
        hasBackground={false}
        hasBorder={false}
        aria-label={name}
        placeholder={value.length === 0 ? 'Empty' : undefined}
        aria-autocomplete="list"
        aria-expanded={isSuggesting}
        aria-activedescendant={isSuggesting ? keyboard.activeId : undefined}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setIsDismissed(false);
          // A new query is a new list — don't carry a highlight over to it.
          keyboard.setActiveId(undefined);
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {/*
        No backdrop: it would cover the input and swallow caret clicks (the
        date calendar's same reason); the input's blur ends the session
        instead, and mouse-down in the list never takes focus from it.
      */}
      <Popover
        open={isSuggesting}
        onClose={() => setIsDismissed(true)}
        // Anchored to the inline input, not the whole value: the current
        // token always starts at the input's left edge (it clears after
        // each commit and sits right after the last pill), so this is the
        // token's start — fixed while typing (the text scrolls inside the
        // input; the input itself doesn't move), and a fresh position once
        // a commit adds a pill before it.
        anchorRef={inputRef}
        side="bottom"
        alignment="start"
        size="fit-content"
        backdrop={false}
      >
        <MenuContext.Provider value={keyboard}>
          <div
            ref={listRef}
            role="menu"
            className="menu menu--small property-list__tag-suggestions"
            aria-label="Tag suggestions"
            onMouseDown={(event) => event.preventDefault()}
          >
            {suggestions.map((tag) => {
              const id = suggestionId(idScope, tag);
              return (
                <MenuItem key={id} id={id} tabIndex={-1} onClick={() => addTag(tag)}>
                  <span className="property-list__tag-suggestion">
                    <span className="property-list__tag-prefix">#</span>
                    {formatTagDisplayLabel(tag)}
                  </span>
                </MenuItem>
              );
            })}
          </div>
        </MenuContext.Provider>
      </Popover>
    </div>
  );
}
