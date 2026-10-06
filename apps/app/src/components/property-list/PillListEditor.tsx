import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { Input } from '@components/input/Input';
import { MenuContext } from '@components/menu/Menu.context';
import { useMenuKeyboard } from '@components/menu/useMenuKeyboard';
import { Popover } from '@components/popover/Popover';

import './PillListEditor.css';

/**
 * The state every pill-list editor (tags, multi-select values) shares: the
 * inline input's draft text and focus, whether the suggestion popover was
 * dismissed (Escape / click away) until typing resumes, and the
 * input-driven menu keyboard the popover's rows read through MenuContext.
 * The editor keeps its own value, validation and commit rules.
 */
export function usePillListEditor() {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  // Whether focus is anywhere inside the value (the input, a pill, a pill's editor): the field is
  // being edited. It decides what clicking an existing pill does — edit it while editing, else its
  // own action (a tag opens its collection).
  const [isEditing, setIsEditing] = useState(false);
  // `isEditing` as it was when the press that became this click began: pressing a pill itself moves
  // focus onto it, so by the click the field would always look "being edited".
  const pressedWhileEditingRef = useRef(false);
  // No preferredActiveId: nothing is highlighted until ArrowUp/Down or hover.
  const keyboard = useMenuKeyboard(listRef);
  const idScope = useId();

  return {
    inputRef,
    listRef,
    draft,
    setDraft,
    isFocused,
    setIsFocused,
    isDismissed,
    setIsDismissed,
    isEditing,
    setIsEditing,
    pressedWhileEditingRef,
    /** Whether activating an existing pill right now should edit it (the field was already being edited). */
    shouldEditPill: () => pressedWhileEditingRef.current,
    keyboard,
    idScope,
  };
}

export type PillListEditorState = ReturnType<typeof usePillListEditor>;

interface PillListEditorProps {
  /** The property's name — the input's accessible label. */
  name: string;
  editor: PillListEditorState;
  /** Whether the list has no values yet (shows the input's "Empty" placeholder). */
  isEmpty: boolean;
  /** Whether the suggestion popover is open (the editor's focus/dismiss/matches rule). */
  isSuggesting: boolean;
  /** Extra class on the wrapper (e.g. the reject shake). */
  className?: string | false;
  /** Accessible name of the suggestion menu. */
  menuLabel: string;
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
  /** Runs after focus leaves the input — commits the pending draft. */
  onBlur(): void;
  /** The value pills (and an in-place pill editor), before the input. */
  pills: ReactNode;
  /** The suggestion menu's rows (MenuItem), inside its menu. */
  suggestionRows: ReactNode;
}

/**
 * The editable state of a list Property: the pills, then an inline Input,
 * with existing matches in a popover under the input. Clicking anywhere in
 * the value focuses the input. The wrapper is the focused surface; the
 * pills and the input are the controls inside it (PillListEditor.css).
 *
 * The suggestions are a menu: the `.menu` surface with real MenuItem
 * rows. `Menu` itself isn't used because it only handles keys while it has
 * focus, and here the input must keep it — so, as in PickerList, the
 * input's useMenuKeyboard (the same hook `Menu` runs on) is handed to the
 * rows through MenuContext, exactly what `Menu` provides them.
 */
export function PillListEditor({
  name,
  editor,
  isEmpty,
  isSuggesting,
  className,
  menuLabel,
  onKeyDown,
  onBlur,
  pills,
  suggestionRows,
}: PillListEditorProps) {
  const {
    inputRef,
    listRef,
    draft,
    setDraft,
    setIsFocused,
    setIsDismissed,
    setIsEditing,
    pressedWhileEditingRef,
    keyboard,
  } = editor;

  return (
    <div
      className={['property-list__value pill-list-editor', className].filter(Boolean).join(' ')}
      onClick={() => inputRef.current?.focus()}
      onMouseDownCapture={(event) => {
        pressedWhileEditingRef.current = event.currentTarget.contains(document.activeElement);
      }}
      // Enter/Space on a focused pill: it has focus, so the field is being edited.
      onKeyDownCapture={() => {
        pressedWhileEditingRef.current = true;
      }}
      onFocus={() => setIsEditing(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsEditing(false);
        }
      }}
    >
      {pills}
      <Input
        ref={inputRef}
        className="pill-list-editor__input"
        hasBackground={false}
        hasBorder={false}
        aria-label={name}
        placeholder={isEmpty ? 'Empty' : undefined}
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
        onKeyDown={onKeyDown}
        onBlur={() => {
          setIsFocused(false);
          onBlur();
        }}
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
        offset={12}
        size="fit-content"
        backdrop={false}
      >
        <MenuContext.Provider value={keyboard}>
          <div
            ref={listRef}
            role="menu"
            className="menu menu--small pill-list-editor__suggestions"
            aria-label={menuLabel}
            onMouseDown={(event) => event.preventDefault()}
          >
            {suggestionRows}
          </div>
        </MenuContext.Provider>
      </Popover>
    </div>
  );
}
