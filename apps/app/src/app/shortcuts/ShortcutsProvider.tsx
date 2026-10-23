import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { MarkdownShortcutsDialog } from './MarkdownShortcutsDialog';
import { matchShortcut, type ShortcutId } from './shortcuts';

type Handler = () => void;

interface ShortcutsApi {
  register(id: ShortcutId, handler: Handler): () => void;
  /** Opens the Keyboard shortcuts dialog this provider hosts. */
  openShortcutsDialog(): void;
  /** Opens the Markdown guide dialog this provider hosts. */
  openMarkdownShortcutsDialog(): void;
}

const ShortcutsContext = createContext<ShortcutsApi | null>(null);

/** True when the key press is going into a text field, where an unmodified key is typing and not a shortcut. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * The one place a global shortcut is matched. Each owner of an action registers its handler for the shortcut's id
 * (`useShortcutHandler`), so the shortcut runs the same function as the control it stands for.
 *
 * A key press is left alone when:
 *  - something already handled it (`defaultPrevented`: the Markdown editor's own keymap, a text field),
 *  - it is a repeat or part of an IME composition,
 *  - it is an unmodified key going into a text field (every current shortcut is a ⌘ chord, so this is a guard for
 *    any plain-key shortcut added later),
 *  - the desktop app's menu bar owns it (the native menu handles it, so handling it here would run it twice), or
 *  - nobody has registered a handler for it (the action isn't available on this screen).
 * Escape is never matched: each open overlay dismisses itself (components/overlay/hooks/useEscape.ts).
 */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<ShortcutId, Handler>());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [markdownDialogOpen, setMarkdownDialogOpen] = useState(false);

  const register = useCallback((id: ShortcutId, handler: Handler) => {
    handlers.current.set(id, handler);
    return () => {
      // Only drop it if it is still ours: a newer registration for the same id must stay.
      if (handlers.current.get(id) === handler) handlers.current.delete(id);
    };
  }, []);
  const openShortcutsDialog = useCallback(() => setDialogOpen(true), []);
  const openMarkdownShortcutsDialog = useCallback(() => setMarkdownDialogOpen(true), []);
  const api = useMemo(
    () => ({ register, openShortcutsDialog, openMarkdownShortcutsDialog }),
    [register, openShortcutsDialog, openMarkdownShortcutsDialog]
  );

  useEffect(() => {
    const desktop = isTauri();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const shortcut = matchShortcut(event);
      if (!shortcut) return;
      if (isEditableTarget(event.target) && !event.metaKey && !event.ctrlKey) return;
      if (desktop && shortcut.owner === 'native') return;
      const handler = handlers.current.get(shortcut.id);
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useShortcutHandlerOn(register, 'show-shortcuts', openShortcutsDialog);

  return (
    <ShortcutsContext.Provider value={api}>
      {children}
      <KeyboardShortcutsDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <MarkdownShortcutsDialog open={markdownDialogOpen} onClose={() => setMarkdownDialogOpen(false)} />
    </ShortcutsContext.Provider>
  );
}

function useShortcutHandlerOn(register: ShortcutsApi['register'], id: ShortcutId, handler: Handler): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => register(id, () => latest.current()), [register, id]);
}

/** Registers `handler` as the action for shortcut `id` for as long as the caller is mounted. No provider: nothing. */
export function useShortcutHandler(id: ShortcutId, handler: Handler): void {
  const api = useContext(ShortcutsContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => api?.register(id, () => latest.current()), [api, id]);
}

/**
 * Registers several shortcut handlers at once, for as long as the caller is mounted. Handlers are read through a ref,
 * so a new function each render costs no re-registration; only a change in WHICH ids are handled does.
 */
export function useShortcutHandlers(handlers: Partial<Record<ShortcutId, Handler>>): void {
  const api = useContext(ShortcutsContext);
  const latest = useRef(handlers);
  latest.current = handlers;
  const ids = (Object.keys(handlers) as ShortcutId[]).sort().join(',');
  useEffect(() => {
    if (!api || !ids) return;
    const unregister = (ids.split(',') as ShortcutId[]).map((id) => api.register(id, () => latest.current[id]?.()));
    return () => unregister.forEach((off) => off());
  }, [api, ids]);
}

/** The hosted Keyboard shortcuts dialog's opener, or null when no provider hosts one (the caller then keeps its own). */
export function useKeyboardShortcutsDialog(): { open(): void } | null {
  const api = useContext(ShortcutsContext);
  return useMemo(() => (api ? { open: api.openShortcutsDialog } : null), [api]);
}

/** The hosted Markdown guide dialog's opener, or null when no provider hosts one (the caller then keeps its own). */
export function useMarkdownShortcutsDialog(): { open(): void } | null {
  const api = useContext(ShortcutsContext);
  return useMemo(() => (api ? { open: api.openMarkdownShortcutsDialog } : null), [api]);
}
