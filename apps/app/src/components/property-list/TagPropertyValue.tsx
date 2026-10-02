import { useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

import { Button } from '@components/button/Button';
import { Input } from '@components/input/Input';
import { formatTagDisplayLabel, normalizeTagName } from '@core/vault/models/Tag';
import { scanTag } from '@features/markdown/editor/codemirror/tag/tagScanner';
import { AppIcon } from '@shared/icon';

import type { PropertyEditability } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';
import { useRejectShake } from './useRejectShake';

type TagPropertyValueProps = {
  /** The property's name — used only as the input's accessible label. */
  name: string;
  /** Tag names without their `#`, as frontmatter `tags` stores them. */
  value: readonly string[];
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
            <TagPill key={tag} tag={tag} />
          ))}
        </span>
      </PropertyValueCell>
    );
  }

  return <TagPropertyEditor name={props.name} value={props.value} onCommit={props.onCommit} />;
}

/**
 * One tag as a pill — the editor's inline tag look (same tokens, a dimmed
 * `#` prefix, `formatTagDisplayLabel` for the label). With `onRemove`, a
 * dismiss button appears over the pill on hover, absolutely positioned so
 * it never shifts the row.
 */
function TagPill({ tag, onRemove }: { tag: string; onRemove?(): void }) {
  function handleRemove(event: MouseEvent<HTMLButtonElement>) {
    // The editor focuses its input on any click inside it — removing a tag
    // must not also start typing.
    event.stopPropagation();
    onRemove?.();
  }

  return (
    <span className="property-list__tag">
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

interface TagPropertyEditorProps {
  name: string;
  value: readonly string[];
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
 */
function TagPropertyEditor({ name, value, onCommit }: TagPropertyEditorProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const { shakeClassName, shake } = useRejectShake();

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

    if (!hasTag(value, tag)) {
      onCommit([...value, tag]);
    }

    setDraft('');
    return true;
  }

  function removeTag(tag: string) {
    onCommit(value.filter((existing) => existing !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return;
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
        <TagPill key={tag} tag={tag} onRemove={() => removeTag(tag)} />
      ))}
      <Input
        ref={inputRef}
        className="property-list__tag-input"
        hasBackground={false}
        hasBorder={false}
        aria-label={name}
        placeholder={value.length === 0 ? 'Empty' : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
}
