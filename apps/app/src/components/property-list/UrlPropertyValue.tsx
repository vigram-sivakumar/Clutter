import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

import { Input } from '@components/input/Input';
import { openExternalUrl, resolveNavigationUrl } from '@shared/helpers/openExternalUrl';
import { parseWebUrl } from '@shared/helpers/parseWebUrl';

import type { PropertyEditability } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';
import { useRejectShake } from './useRejectShake';

type UrlPropertyValueProps = {
  /** The property's name — used only as the field's accessible label. */
  name: string;
  /** The URL exactly as entered, or null when absent. */
  value: string | null;
} & PropertyEditability<string | null>;

/**
 * Reads typed text as a URL Property value: the trimmed text itself when it
 * is a web URL — explicitly `http(s)://…`, or a bare domain like
 * `example.com`, which `resolveNavigationUrl` (the same rule Markdown links
 * navigate by) resolves to `https://` — else null. The value is stored as
 * typed; only navigation adds the scheme.
 */
export function parseUrlPropertyInput(text: string): string | null {
  const trimmed = text.trim();
  return trimmed !== '' && parseWebUrl(resolveNavigationUrl(trimmed)) ? trimmed : null;
}

/**
 * The `url` Property's value. `editable` (supplied by the adapter, never
 * inferred here) picks the state: read-only renders a link; editable
 * renders a single-line Input.
 */
export function UrlPropertyValue(props: UrlPropertyValueProps) {
  if (!props.editable) {
    return <PropertyValueCell>{props.value && <UrlLink url={props.value} />}</PropertyValueCell>;
  }

  return <UrlPropertyEditor name={props.name} value={props.value} onCommit={props.onCommit} />;
}

/**
 * Read-only state. Styled with the Markdown link tokens (same color and
 * underline as the editor's links) and opened the way editor links are,
 * via `openExternalUrl` — the system browser in the desktop app, a new tab
 * on the web — rather than relying on the anchor's own navigation.
 */
function UrlLink({ url }: { url: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    void openExternalUrl(url);
  }

  return (
    <a
      className="property-list__link"
      href={resolveNavigationUrl(url)}
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      <span className="property-list__link-title">{url}</span>
    </a>
  );
}

interface UrlPropertyEditorProps {
  name: string;
  value: string | null;
  /** Fired with a valid URL as entered, or null when the text is emptied. */
  onCommit(value: string | null): void;
}

/**
 * Editable state — same commit rules as the date editor: the text is a
 * free draft while focused; Enter or blur commits it only if it is a valid
 * URL (parseUrlPropertyInput). Enter on an invalid draft keeps the text
 * and focus and plays EditableText's reject shake; blur with an invalid
 * draft discards it and restores the last valid value. Emptying the text
 * clears the value — there is no separate Clear action for a URL.
 */
function UrlPropertyEditor({ name, value, onCommit }: UrlPropertyEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const { shakeClassName, shake } = useRejectShake();

  const isEditing = draft !== null;

  /** Commits the draft when it is valid (or emptied); returns whether it was accepted. */
  function commitDraft(text: string): boolean {
    if (text.trim() === '') {
      if (value !== null) {
        onCommit(null);
      }
      return true;
    }

    const url = parseUrlPropertyInput(text);

    if (url === null) {
      return false;
    }

    if (url !== value) {
      onCommit(url);
    }

    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (draft !== null && !commitDraft(draft)) {
      shake();
      return;
    }

    setDraft(null);
  }

  function handleBlur() {
    if (draft !== null) {
      commitDraft(draft);
    }

    setDraft(null);
  }

  return (
    <Input
      className={[
        'property-list__value property-list__input property-list__url-input',
        !isEditing && value && 'property-list__url-input--link',
        shakeClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      hasBackground={isEditing}
      hasBorder={isEditing}
      aria-label={name}
      placeholder="Empty"
      value={draft ?? value ?? ''}
      onFocus={() => setDraft(value ?? '')}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
