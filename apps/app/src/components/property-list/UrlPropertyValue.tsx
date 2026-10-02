import { useEffect, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';

import { Button } from '@components/button/Button';
import { Input } from '@components/input/Input';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
import {
  openExternalUrl,
  resolveNavigationUrl,
} from '@shared/helpers/openExternalUrl';
import { isWebUrl } from '@core/vault/ingest/frontmatter/customFrontmatter';
import { parseWebUrl } from '@shared/helpers/parseWebUrl';
import { sharedMarkdownParser } from '@features/markdown/render/sharedMarkdownParser';
import { AppIcon } from '@shared/icon';

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
 * Whether `text`, as a whole, is a URL to the Markdown grammar — parsed
 * with `sharedMarkdownParser` (the editor's exact grammar, CM6-free), so a
 * URL Property accepts precisely what the editor would link: `Autolink`'s
 * `http(s)://` / `www.` URLs (with port and path), `mailto:`/`xmpp:`, and
 * email addresses, plus the bare-domain rule (`example.com`,
 * `example.co.uk/path`, curated TLDs). The whole text must be one `URL`
 * node — `see example.com` or `readme.md` is not a URL.
 */
function isMarkdownUrl(text: string): boolean {
  let matched = false;

  sharedMarkdownParser.parse(text).iterate({
    enter(node) {
      if (node.name === 'URL' && node.from === 0 && node.to === text.length) {
        matched = true;
      }
      return !matched;
    },
  });

  return matched;
}

/** A scheme other than http(s) — `mailto:`, `xmpp:`, `javascript:` … */
const NON_WEB_SCHEME = /^(?!https?:)[a-z][a-z0-9+.-]*:/i;
/** A bare domain's start: a dotted host, never an email (`a@b.co`) or `host:port` without a scheme. */
const BARE_DOMAIN = /^[^\s/:@]+\.[^\s/:@]+/;

/**
 * Reads typed text as a URL Property's **stored** value, or null when it
 * isn't one — the single rule shared by the editor and the write:
 *
 * - Accepted when the Markdown grammar links it as a URL (isMarkdownUrl) or
 *   it is an explicit `http(s)://` URL the platform parser accepts, so
 *   `http://localhost:3000` and IP addresses still count.
 * - Stored as an absolute `http(s)` URL: an explicit one as typed, a bare
 *   domain (`example.com`, `www.example.com/a`) with `https://` added — the
 *   only forms a saved value reads back as a `url` (isWebUrl, the
 *   frontmatter reader's own rule, is the final gate).
 * - `mailto:`/`xmpp:` links and email addresses are valid Markdown links but
 *   would read back as text, so they are rejected here rather than silently
 *   dropped later.
 */
export function parseUrlPropertyInput(text: string): string | null {
  const trimmed = text.trim();

  if (trimmed === '' || NON_WEB_SCHEME.test(trimmed)) {
    return null;
  }

  if (!isMarkdownUrl(trimmed) && !parseWebUrl(trimmed)) {
    return null;
  }

  const isExplicit = /^https?:\/\//i.test(trimmed);

  if (!isExplicit && !BARE_DOMAIN.test(trimmed)) {
    return null;
  }

  const stored = isExplicit ? trimmed : `https://${trimmed}`;

  return isWebUrl(stored) ? stored : null;
}

/**
 * The `url` Property's value. `editable` (supplied by the adapter, never
 * inferred here) picks the state: read-only renders a link; editable
 * renders a single-line Input.
 */
export function UrlPropertyValue(props: UrlPropertyValueProps) {
  if (!props.editable) {
    return (
      <PropertyValueCell
        truncate
        actions={props.value && <UrlActions url={props.value} />}
      >
        {props.value && <UrlLink url={props.value} />}
      </PropertyValueCell>
    );
  }

  return (
    <UrlPropertyEditor
      name={props.name}
      value={props.value}
      onCommit={props.onCommit}
    />
  );
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
      title={url}
      href={resolveNavigationUrl(url)}
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      <span className="property-list__link-title">{url}</span>
    </a>
  );
}

/** How long the Copy button shows its "copied" check before reverting. */
const COPIED_FEEDBACK_MS = 1500;

/**
 * The URL's trailing actions: open it (the same `openExternalUrl` path
 * as the link) and copy it to the clipboard (`copyTextToClipboard`, the
 * app's one clipboard-write helper). Copy briefly swaps to a check so
 * the click visibly did something (the `tick` icon).
 */
function UrlActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="property-list__url-actions">
      <Button
        isIconOnly
        variant="ghost"
        size="small"
        aria-label="Open link"
        title="Open link"
        onClick={() => void openExternalUrl(url)}
      >
        <AppIcon icon="arrowUpRight" />
      </Button>
      <Button
        isIconOnly
        variant="ghost"
        size="small"
        aria-label={copied ? 'Copied' : 'Copy link'}
        title={copied ? 'Copied' : 'Copy link'}
        onClick={() => {
          void copyTextToClipboard(url).then(() => setCopied(true));
        }}
      >
        <AppIcon icon={copied ? 'tick' : 'copy'} />
      </Button>
    </div>
  );
}

interface UrlPropertyEditorProps {
  name: string;
  value: string | null;
  /** Fired with the URL as it is stored (parseUrlPropertyInput), or null when the text is emptied. */
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
      title={isEditing ? undefined : (value ?? undefined)}
      placeholder="Empty"
      // Hidden while editing, so it never competes with the text being
      // typed; at rest, revealed on hover (PropertyList.css), like Entry's
      // own actions slot does for a read-only URL.
      trailing={!isEditing && value ? <UrlActions url={value} /> : undefined}
      value={draft ?? value ?? ''}
      onFocus={() => setDraft(value ?? '')}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
