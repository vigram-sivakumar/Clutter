import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

import { Button } from '@components/button/Button';
import { Input } from '@components/input/Input';
import { MenuContext } from '@components/menu/Menu.context';
import { MenuItem } from '@components/menu/MenuItem';
import { useMenuKeyboard } from '@components/menu/useMenuKeyboard';
import { Popover } from '@components/popover/Popover';
import { AppIcon } from '@shared/icon';

import type { MultiSelectSuggestion, PropertyEditability } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';
import { useRejectShake } from './useRejectShake';

type MultiSelectPropertyValueProps = {
  /** The property's name — used only as the input's accessible label. */
  name: string;
  /** The values, in order. */
  value: readonly string[];
  /** Autocomplete for the value being typed (see PropertyList.types). */
  getSuggestions?(query: string): readonly MultiSelectSuggestion[];
} & PropertyEditability<string[]>;

/** Whether `values` already holds `entry`, ignoring case and surrounding whitespace. */
function hasValue(values: readonly string[], entry: string): boolean {
  const identity = entry.trim().toLowerCase();
  return values.some((value) => value.trim().toLowerCase() === identity);
}

/**
 * The `multi-select` Property's value — multiple free-text values shown as
 * pills (e.g. Aliases). `editable` (supplied by the adapter, never
 * inferred here) picks the state: read-only renders the pills; editable
 * renders the pills plus an inline input.
 */
export function MultiSelectPropertyValue(props: MultiSelectPropertyValueProps) {
  if (!props.editable) {
    return (
      <PropertyValueCell>
        <span className="property-list__tags">
          {props.value.map((entry, index) => (
            <ValuePill key={`${index}-${entry}`} value={entry} />
          ))}
        </span>
      </PropertyValueCell>
    );
  }

  return (
    <MultiSelectPropertyEditor
      name={props.name}
      value={props.value}
      getSuggestions={props.getSuggestions}
      onCommit={props.onCommit}
    />
  );
}

/**
 * One value as a pill — the tag pill's shape and hover-dismiss button
 * (`property-list__tag` and its remove button), on a neutral surface
 * (`--plain`) with no `#` prefix, since these aren't tags. With `onEdit`,
 * a click (or Enter/Space when focused) on the pill — not its dismiss
 * button — starts editing it in place.
 */
function ValuePill({
  value,
  onRemove,
  onEdit,
}: {
  value: string;
  onRemove?(): void;
  onEdit?(): void;
}) {
  function handleRemove(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onRemove?.();
  }

  function handleEdit(event: MouseEvent<HTMLSpanElement>) {
    // Never also reaches the editor's "click anywhere to type" handler.
    event.stopPropagation();
    onEdit?.();
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onEdit?.();
  }

  return (
    <span
      className={['property-list__tag property-list__tag--plain', onEdit && 'property-list__tag--editable']
        .filter(Boolean)
        .join(' ')}
      // A <span>, not a <button>: it contains the dismiss <button>, and
      // buttons can't nest.
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      aria-label={onEdit ? `Edit ${value}` : undefined}
      onClick={onEdit ? handleEdit : undefined}
      onKeyDown={onEdit ? handleEditKeyDown : undefined}
    >
      {value}
      {onRemove && (
        <Button
          className="property-list__tag-remove"
          isIconOnly
          variant="ghost"
          size="small"
          aria-label={`Remove ${value}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleRemove}
        >
          <AppIcon icon="dismiss" />
        </Button>
      )}
    </span>
  );
}

interface ValuePillEditorProps {
  /** The value being edited — the text the input starts with, and what Escape restores. */
  value: string;
  /** Whether `text` (already trimmed) would repeat another value on this list. */
  isTaken(text: string): boolean;
  /** Fired with the trimmed new text when it is a real, allowed change. */
  onCommit(text: string): void;
  /** Ends editing with the value unchanged. */
  onCancel(): void;
}

/**
 * A pill being edited in place: a single-line Input standing where the
 * pill was — plain text, no pill surface — its text selected, sized to
 * its content. Same commit rules as
 * the other Property text editors (EditableText's convention): Enter or
 * blur commits; Escape cancels and restores. Text that is unchanged or
 * empty commits nothing (removing is the dismiss button's job). Text that
 * would repeat another value: Enter keeps editing and plays the reject
 * shake; blur restores the original.
 */
function ValuePillEditor({ value, isTaken, onCommit, onCancel }: ValuePillEditorProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  // Escape/Enter end editing themselves; the blur that follows unmounting
  // focus must not act a second time.
  const isDoneRef = useRef(false);
  const { shakeClassName, shake } = useRejectShake();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  /** Ends editing with the draft; returns false when it was rejected as a repeat. */
  function finish(): boolean {
    const text = draft.trim();

    if (text === '' || text === value) {
      isDoneRef.current = true;
      onCancel();
      return true;
    }

    if (isTaken(text)) {
      return false;
    }

    isDoneRef.current = true;
    onCommit(text);
    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!finish()) {
        shake();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      isDoneRef.current = true;
      onCancel();
    }
  }

  function handleBlur() {
    if (isDoneRef.current) {
      return;
    }

    if (!finish()) {
      isDoneRef.current = true;
      onCancel();
    }
  }

  return (
    <Input
      ref={inputRef}
      className={['property-list__tag property-list__tag-edit-input', shakeClassName]
        .filter(Boolean)
        .join(' ')}
      hasBackground={false}
      hasBorder={false}
      aria-label={`Edit ${value}`}
      // Grows with the text (field-sizing where supported, else `size`).
      size={Math.max(draft.length, 1)}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}

/** DOM id of a suggestion row (useMenuKeyboard addresses rows by id), scoped per editor. */
function suggestionId(scope: string, index: number): string {
  return `${scope}-suggestion-${index}`;
}

interface MultiSelectPropertyEditorProps {
  name: string;
  value: readonly string[];
  getSuggestions?(query: string): readonly MultiSelectSuggestion[];
  /** Fired with the whole new list after each add or remove. */
  onCommit(value: string[]): void;
}

/**
 * Editable state: the tag editor's interaction (TagPropertyValue), for
 * free text. Pills, then an inline Input; clicking anywhere in the value
 * focuses the input. Typing a value and pressing Enter turns it into a
 * pill and leaves the input ready for the next one — Space is ordinary
 * text, since a value may contain spaces:
 * - whitespace-only text never makes a pill;
 * - a value already present (ignoring case) is dropped, not doubled;
 * - Backspace in an empty input removes the last pill;
 * - leaving the field adds the pending text;
 * - clicking a pill edits it in place (ValuePillEditor) — the change
 *   replaces that one value, in position, and nothing else.
 *
 * While typing, `getSuggestions`' matches (minus values already present)
 * show in a popover under the value — the same `.menu` surface,
 * MenuItem rows, and input-driven useMenuKeyboard as the tag editor's
 * suggestions. Nothing starts highlighted; ArrowUp/Down (or hover)
 * highlight one, and Enter or a click adds its `value`. With no
 * highlight, Enter adds the typed text. Escape closes the popover until
 * typing resumes.
 */
function MultiSelectPropertyEditor({
  name,
  value,
  getSuggestions,
  onCommit,
}: MultiSelectPropertyEditorProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  // No preferredActiveId: nothing is highlighted until ArrowUp/Down or hover.
  const keyboard = useMenuKeyboard(listRef);
  const idScope = useId();
  // The pill being edited in place, by index, or null.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const suggestions = useMemo(
    () =>
      draft.trim() === '' || !getSuggestions
        ? []
        : getSuggestions(draft.trim()).filter((suggestion) => !hasValue(value, suggestion.value)),
    [getSuggestions, draft, value]
  );
  const isSuggesting = isFocused && !isDismissed && suggestions.length > 0;

  function addValue(entry: string) {
    const trimmed = entry.trim();

    if (trimmed !== '' && !hasValue(value, trimmed)) {
      onCommit([...value, trimmed]);
    }
    setDraft('');
  }

  function removeValue(index: number) {
    onCommit(value.filter((_, existingIndex) => existingIndex !== index));
  }

  /** Replaces the value at `index` in place, keeping its position. */
  function replaceValue(index: number, entry: string) {
    onCommit(value.map((existing, existingIndex) => (existingIndex === index ? entry : existing)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (isSuggesting && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      keyboard.handleKeyDown(event as unknown as KeyboardEvent<HTMLDivElement>);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const active = isSuggesting
        ? suggestions.find((_, index) => suggestionId(idScope, index) === keyboard.activeId)
        : undefined;
      addValue(active ? active.value : draft);
      return;
    }

    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      removeValue(value.length - 1);
    }
  }

  return (
    <div
      className="property-list__value property-list__tag-editor"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((entry, index) =>
        index === editingIndex ? (
          <ValuePillEditor
            key={`${index}-${entry}`}
            value={entry}
            isTaken={(text) =>
              hasValue(
                value.filter((_, otherIndex) => otherIndex !== index),
                text
              )
            }
            onCommit={(text) => {
              setEditingIndex(null);
              replaceValue(index, text);
            }}
            onCancel={() => setEditingIndex(null)}
          />
        ) : (
          <ValuePill
            key={`${index}-${entry}`}
            value={entry}
            onRemove={() => removeValue(index)}
            onEdit={() => setEditingIndex(index)}
          />
        )
      )}
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
        onBlur={() => {
          setIsFocused(false);
          addValue(draft);
        }}
      />
      {/* No backdrop, anchored to the inline input — the tag editor's same reasons. */}
      <Popover
        open={isSuggesting}
        onClose={() => setIsDismissed(true)}
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
            aria-label={`${name} suggestions`}
            onMouseDown={(event) => event.preventDefault()}
          >
            {suggestions.map((suggestion, index) => {
              const id = suggestionId(idScope, index);
              return (
                <MenuItem
                  key={suggestion.key}
                  id={id}
                  tabIndex={-1}
                  onClick={() => addValue(suggestion.value)}
                >
                  <span className="property-list__suggestion">
                    {suggestion.label}
                    {suggestion.detail && (
                      <span className="property-list__suggestion-detail">{suggestion.detail}</span>
                    )}
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
