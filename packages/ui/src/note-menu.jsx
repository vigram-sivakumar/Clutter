import React, { useEffect, useRef, useState } from 'react';
/** Small shared-web menu; actions retain the current tab/pane as their destination. */
export function NoteMenu({ label, disabled, onNewTab, onSplit }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null),
    trigger = useRef(null),
    first = useRef(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const dismiss = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const select = (action) => {
    setOpen(false);
    action();
  };
  return (
    <div className="note-actions" ref={root}>
      <button
        className="note-menu-trigger"
        ref={trigger}
        disabled={disabled}
        aria-label={'Actions for ' + label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        …
      </button>
      {open && (
        <div
          className="note-menu"
          role="menu"
          aria-label={'Open ' + label}
          onKeyDown={(e) => {
            const items = [
              ...e.currentTarget.querySelectorAll('[role=menuitem]'),
            ];
            const index = items.indexOf(document.activeElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              items[
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? items.length - 1
                    : (index +
                        (e.key === 'ArrowDown' ? 1 : -1) +
                        items.length) %
                      items.length
              ]?.focus();
            }
          }}
        >
          <button ref={first} role="menuitem" onClick={() => select(onNewTab)}>
            Open in new tab
          </button>
          <button role="menuitem" onClick={() => select(onSplit)}>
            Open in split view
          </button>
        </div>
      )}
    </div>
  );
}
