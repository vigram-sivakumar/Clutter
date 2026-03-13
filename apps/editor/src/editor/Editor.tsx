/**
 * Editor — engine-driven. Single pipeline: Key → Command → Ops → apply → render.
 * No DOM mutation. No hybrid.
 */

import { useEffect, useRef } from 'react';
import type { EditorState } from '../engine/engine';
import { EditorController } from './editor-controller';
import { setupKeymap, initIdGenerator } from './keymap';

function createInitialState(): EditorState {
  const rootId = 'root';
  const firstId = 'n0';
  return {
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        parentId: null,
        blockType: 'root',
        inlines: [],
        children: [firstId],
        collapsed: false,
      },
      [firstId]: {
        id: firstId,
        parentId: rootId,
        blockType: 'paragraph',
        inlines: [{ type: 'text', text: '', marks: [] }],
        children: [],
        collapsed: false,
      },
    },
  };
}

export function Editor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<EditorController | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const initialState = createInitialState();
    initIdGenerator(initialState);
    const controller = new EditorController(initialState, el);
    controllerRef.current = controller;

    setupKeymap(el, controller);

    el.addEventListener('beforeinput', (e: Event) => {
      const ev = e as InputEvent;
      if (ev.inputType === 'historyUndo' || ev.inputType === 'historyRedo') {
        ev.preventDefault();
      }
    });

    return () => {
      controllerRef.current = null;
    };
  }, []);

  return <div ref={rootRef} className="clutter-editor" />;
}
