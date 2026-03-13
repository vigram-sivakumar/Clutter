/**
 * Editor — engine-driven. Single pipeline: Key → Command → Ops → apply → render.
 * No DOM mutation. No hybrid.
 */

import { useEffect, useRef } from 'react';
import type { EditorState } from '../engine/engine';
import {
  insertTextCommand,
  splitNodeCommand,
} from '../engine/commands';
import { EditorController } from './editor-controller';
import { setupKeymap, initIdGenerator, genId } from './keymap';
import { isHandlingInput, setInputLock } from './input-lock';
import { getSelection, validateSelection } from './selection';

function createInitialState(): EditorState {
  const rootId = 'root';
  const firstId = 'n0';
  return {
    rootId,
    selection: {
      type: 'collapsed',
      nodeId: firstId,
      inlineIndex: 0,
      offset: 0,
    },
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
  const selectionModeRef = useRef<'caret' | 'inline' | 'block'>('caret');
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedEnoughRef = useRef(false);
  const dragStartedInContentRef = useRef(false);
  const lastDragEndNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const initialState = createInitialState();
    initIdGenerator(initialState);

    const handleEnter = () => {
      const controller = controllerRef.current;
      if (!controller) return;
      const state = controller.getState();
      const sel = state.selection;
      if (!sel) return;

      if (sel.type === 'range') {
        if (sel.anchor.nodeId !== sel.focus.nodeId) return;
        const nodeId = sel.anchor.nodeId;
        const inlineIndex = sel.anchor.inlineIndex;
        const startOffset = Math.min(sel.anchor.offset, sel.focus.offset);
        const endOffset = Math.max(sel.anchor.offset, sel.focus.offset);
        const length = endOffset - startOffset;
        const node = state.nodes[nodeId];
        const seg = node?.inlines[inlineIndex];
        if (!seg || seg.type !== 'text') return;
        const deletedText = seg.text.slice(startOffset, endOffset);
        const newId = genId();
        const deleteOps = [
          { type: 'DeleteText' as const, nodeId, inlineIndex, offset: startOffset, length, deletedText },
          { type: 'NormalizeInline' as const, nodeId },
        ];
        const splitOps = splitNodeCommand(state, nodeId, inlineIndex, startOffset, newId);
        controller.dispatch([...deleteOps, ...splitOps], { type: 'collapsed', nodeId: newId, inlineIndex: 0, offset: 0 });
        return;
      }

      if (sel.type === 'collapsed') {
        const newId = genId();
        const ops = splitNodeCommand(state, sel.nodeId, sel.inlineIndex, sel.offset, newId);
        controller.dispatch(ops, { type: 'collapsed', nodeId: newId, inlineIndex: 0, offset: 0 });
      }
    };

    const handleBeforeInput = (e: Event) => {
      const ev = e as InputEvent;
      setInputLock(true);
      try {
        const controller = controllerRef.current;
        if (!controller) return;

        if (ev.inputType === 'insertParagraph') {
          ev.preventDefault();
          handleEnter();
          return;
        }

        const state = controller.getState();
        console.log('BEFOREINPUT', ev.inputType, controller.getState().selection);
        const sel = state.selection;
        if (!sel) return;

        if (ev.inputType === 'historyUndo' || ev.inputType === 'historyRedo') {
          ev.preventDefault();
          return;
        }

        if (sel.type !== 'collapsed') return;

        if (ev.inputType === 'insertText' && ev.data) {
          ev.preventDefault();
          const ops = insertTextCommand(state, sel.nodeId, sel.inlineIndex, sel.offset, ev.data);
          controller.dispatch(ops, {
            type: 'collapsed',
            nodeId: sel.nodeId,
            inlineIndex: sel.inlineIndex,
            offset: sel.offset + ev.data.length,
          });
          return;
        }
      } finally {
        queueMicrotask(() => {
          setInputLock(false);
        });
      }
    };

    const controller = new EditorController(initialState, el);
    controllerRef.current = controller;

    const cleanupKeymap = setupKeymap(el, controller);

    el.addEventListener('beforeinput', handleBeforeInput);

    let isMouseSelecting = false;
    let dragStartNodeId: string | null = null;
    let isBlockDragging = false;
    let didMouseMove = false;

    const handleMouseDown = (e: MouseEvent) => {
      didMouseMove = false;
      const content = (e.target as HTMLElement).closest('.clutter-node__content');
      dragStartedInContentRef.current = !!content;

      const targetNode = e.target as Node;

      const element =
        targetNode instanceof HTMLElement
          ? targetNode
          : targetNode.parentElement;

      if (!element) return;

      if (!element.closest('.clutter-node__content')) return;

      const controller = controllerRef.current;
      if (controller) {
        const currentSel = controller.getState().selection;
        if (currentSel?.type === 'block-range') {
          const wrapper = element.closest('[data-node-id]');
          const nodeId = wrapper?.getAttribute('data-node-id');
          if (nodeId && !isHandlingInput) {
            controller.dispatch([], {
              type: 'collapsed',
              nodeId,
              inlineIndex: 0,
              offset: 0,
            });
          }
        }
      }

      if (content) {
        selectionModeRef.current = 'caret';
      }

      const wrapper = element.closest('[data-node-id]');
      if (!wrapper) return;

      el.focus({ preventScroll: true });

      isMouseSelecting = true;
      isBlockDragging = false;

      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      hasMovedEnoughRef.current = false;
      lastDragEndNodeIdRef.current = null;

      dragStartNodeId = wrapper.getAttribute('data-node-id');
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartedInContentRef.current) {
        return;
      }

      const moveTarget = e.target as HTMLElement;
      if (moveTarget.closest('.clutter-node__content')) {
        return;
      }

      if (isMouseSelecting) didMouseMove = true;

      if (!isMouseSelecting || !dragStartPosRef.current) return;

      const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
      const dy = Math.abs(e.clientY - dragStartPosRef.current.y);

      if (!hasMovedEnoughRef.current) {
        if (dx + dy < 4) {
          return;
        }
        hasMovedEnoughRef.current = true;
      }

      if (!hasMovedEnoughRef.current) return;
      if (!dragStartNodeId) return;

      const controller = controllerRef.current;
      if (!controller) return;

      const target = e.target as HTMLElement;
      const wrapper = target.closest('[data-node-id]');
      const currentNodeId = wrapper?.getAttribute('data-node-id');

      if (!currentNodeId) return;
      if (currentNodeId === dragStartNodeId) return;

      const currentSel = controller.getState().selection;
      if (
        currentSel?.type === 'block-range' &&
        currentSel.startNodeId === dragStartNodeId &&
        currentSel.endNodeId === currentNodeId
      ) {
        return;
      }

      // Selection state only finalizes on mouseup. Track end node during drag.
      lastDragEndNodeIdRef.current = currentNodeId;

      {
        // First time crossing boundary
        if (!isBlockDragging) {
          isBlockDragging = true;

          // Kill native selection engine immediately
          const nativeSel = window.getSelection();
          if (nativeSel) {
            nativeSel.removeAllRanges();
          }
        }

        e.preventDefault();

        selectionModeRef.current = 'block';
        el.focus({ preventScroll: true });
      }
    };

    // TEMP: Disabled for isolation
    // function selectionWithinSingleNode(nativeSel: globalThis.Selection): boolean {
    //   if (!nativeSel || nativeSel.rangeCount === 0) return false;
    //   const range = nativeSel.getRangeAt(0);
    //   if (range.collapsed) return false;
    //   const anchorEl =
    //     nativeSel.anchorNode instanceof Element
    //       ? nativeSel.anchorNode
    //       : nativeSel.anchorNode?.parentElement;
    //   const focusEl =
    //     nativeSel.focusNode instanceof Element
    //       ? nativeSel.focusNode
    //       : nativeSel.focusNode?.parentElement;
    //   const anchorWrapper = anchorEl?.closest?.('[data-node-id]');
    //   const focusWrapper = focusEl?.closest?.('[data-node-id]');
    //   if (!anchorWrapper || !focusWrapper) return false;
    //   if (!el?.contains(anchorWrapper) || !el?.contains(focusWrapper)) return false;
    //   return anchorWrapper === focusWrapper;
    // }

    const handleMouseUp = () => {
      if (!isMouseSelecting) return;

      isMouseSelecting = false;
      dragStartedInContentRef.current = false;

      const hadMovedEnough = hasMovedEnoughRef.current;
      dragStartPosRef.current = null;
      hasMovedEnoughRef.current = false;

      if (selectionModeRef.current === 'block') {
        // Block selection finalizes on mouseup
        const endNodeId = lastDragEndNodeIdRef.current ?? dragStartNodeId;
        if (dragStartNodeId && endNodeId && !isHandlingInput) {
          const currentSel = controllerRef.current?.getState().selection;
          if (!currentSel || currentSel.type !== 'block-range') {
            controllerRef.current?.dispatch([], {
              type: 'block-range',
              startNodeId: dragStartNodeId,
              endNodeId,
            });
          }
          el.focus({ preventScroll: true });
        }
        dragStartNodeId = null;
        lastDragEndNodeIdRef.current = null;
        return;
      }

      if (isBlockDragging) {
        dragStartNodeId = null;
        lastDragEndNodeIdRef.current = null;
        return;
      }

      const controller = controllerRef.current;
      if (!controller) return;

      if (controller.isRestoringSelection()) return;

      if (dragStartNodeId && didMouseMove && hadMovedEnough) {
        const endNodeId = lastDragEndNodeIdRef.current ?? dragStartNodeId;
        const currentSel = controller.getState().selection;
        if ((!currentSel || currentSel.type !== 'block-range') && !isHandlingInput) {
          controller.dispatch([], {
            type: 'block-range',
            startNodeId: dragStartNodeId,
            endNodeId,
          });
          selectionModeRef.current = 'block';
          el.focus({ preventScroll: true });
        }
        dragStartNodeId = null;
        lastDragEndNodeIdRef.current = null;
        return;
      }

      const sel = getSelection(el);
      if (!sel) return;

      const valid = validateSelection(controller.getState(), sel);
      if (valid && !isHandlingInput) {
        const prevSelection = controller.getState().selection;
        if (JSON.stringify(prevSelection) === JSON.stringify(valid)) return;

        selectionModeRef.current =
          sel.type === 'range' ? 'inline' : 'caret';
        controller.dispatch([], valid);
      }

      dragStartNodeId = null;
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    const handleClick = () => {
      if (selectionModeRef.current === 'block') return;

      const controller = controllerRef.current;
      if (!controller) return;
      if (controller.isRestoringSelection()) return;

      // TEMP: Disabled - no DOM selection read
      // const sel = getSelection(el);
      // if (!sel) return;
      // const valid = validateSelection(controller.getState(), sel);
      // if (valid) {
      //   selectionModeRef.current = 'caret';
      //   controller.dispatch([], valid);
      // }
    };

    const handleMouseLeave = () => {
      isMouseSelecting = false;
      dragStartNodeId = null;
      isBlockDragging = false;
      lastDragEndNodeIdRef.current = null;
    };

    el.addEventListener('click', handleClick);
    el.addEventListener('mouseleave', handleMouseLeave);

    const handleFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && el.contains(next)) return;

      // Only clear DOM selection for block-range. Never clear for inline range.
      const controller = controllerRef.current;
      const selection = controller?.getState().selection;
      if (selection?.type === 'block-range') {
        const nativeSel = window.getSelection();
        if (nativeSel) nativeSel.removeAllRanges();
      }
    };

    el.addEventListener('focusout', handleFocusOut);

    return () => {
      el.removeEventListener('beforeinput', handleBeforeInput);
      cleanupKeymap();
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('click', handleClick);
      el.removeEventListener('focusout', handleFocusOut);
      controllerRef.current = null;
    };
  }, []);

  return <div ref={rootRef} className="clutter-editor" tabIndex={0} />;
}
