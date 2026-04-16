/**
 * Editor — engine-driven. Single pipeline: Key → Command → Ops → apply → render.
 * No DOM mutation. No hybrid.
 */

import { useEffect, useRef } from 'react';
import { applyOp, getVisibleNodeIds } from '../engine/engine';
import type { EditorState, PrimitiveOp } from '../engine/engine';
import { insertTextCommand, splitNodeCommand } from '../engine/commands';
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
        const deleteOps: PrimitiveOp[] = [
          {
            type: 'DeleteText',
            nodeId,
            inlineIndex,
            offset: startOffset,
            length,
            deletedText,
          },
          { type: 'NormalizeInline', nodeId },
        ];
        // Apply deleteOps to a temporary state before computing the split.
        // splitNodeCommand must see the post-delete content so it doesn't generate
        // a second DeleteText for the same range — which would double-insert on undo.
        let postDeleteState = state;
        for (const op of deleteOps) {
          postDeleteState = applyOp(postDeleteState, op);
        }
        const splitOps = splitNodeCommand(
          postDeleteState,
          nodeId,
          inlineIndex,
          startOffset,
          newId
        );
        controller.dispatch([...deleteOps, ...splitOps], {
          type: 'collapsed',
          nodeId: newId,
          inlineIndex: 0,
          offset: 0,
        });
        return;
      }

      if (sel.type === 'block-range') {
        // Collapse to the first visible node in the range and split at end of
        // its text, creating a new empty node immediately after it.
        const visible = getVisibleNodeIds(state);
        const startIdx = visible.indexOf(sel.startNodeId);
        const endIdx = visible.indexOf(sel.endNodeId);
        if (startIdx === -1 || endIdx === -1) return;
        const landingNodeId = visible[Math.min(startIdx, endIdx)];
        if (!landingNodeId) return;
        const landingNode = state.nodes[landingNodeId];
        const landingInline = landingNode?.inlines[0];
        const splitOffset =
          landingInline && landingInline.type === 'text'
            ? landingInline.text.length
            : 0;
        const newId = genId();
        const ops = splitNodeCommand(
          state,
          landingNodeId,
          0,
          splitOffset,
          newId
        );
        controller.dispatch(ops, {
          type: 'collapsed',
          nodeId: newId,
          inlineIndex: 0,
          offset: 0,
        });
        return;
      }

      if (sel.type === 'collapsed') {
        const newId = genId();
        const ops = splitNodeCommand(
          state,
          sel.nodeId,
          sel.inlineIndex,
          sel.offset,
          newId
        );
        controller.dispatch(ops, {
          type: 'collapsed',
          nodeId: newId,
          inlineIndex: 0,
          offset: 0,
        });
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
        console.log(
          'BEFOREINPUT',
          ev.inputType,
          controller.getState().selection
        );
        const sel = state.selection;
        if (!sel) return;

        if (ev.inputType === 'historyUndo' || ev.inputType === 'historyRedo') {
          ev.preventDefault();
          return;
        }

        if (ev.inputType === 'insertText' && ev.data) {
          ev.preventDefault();
          if (sel.type === 'collapsed') {
            const ops = insertTextCommand(
              state,
              sel.nodeId,
              sel.inlineIndex,
              sel.offset,
              ev.data
            );
            controller.dispatch(ops, {
              type: 'collapsed',
              nodeId: sel.nodeId,
              inlineIndex: sel.inlineIndex,
              offset: sel.offset + ev.data.length,
            });
            return;
          }
          if (sel.type === 'range' && sel.anchor.nodeId === sel.focus.nodeId) {
            const nodeId = sel.anchor.nodeId;
            const inlineIndex = sel.anchor.inlineIndex;
            const startOffset = Math.min(sel.anchor.offset, sel.focus.offset);
            const endOffset = Math.max(sel.anchor.offset, sel.focus.offset);
            const length = endOffset - startOffset;
            const node = state.nodes[nodeId];
            const seg = node?.inlines[inlineIndex];
            if (!seg || seg.type !== 'text') return;
            const deletedText = seg.text.slice(startOffset, endOffset);
            const deleteOps: PrimitiveOp[] = [
              {
                type: 'DeleteText',
                nodeId,
                inlineIndex,
                offset: startOffset,
                length,
                deletedText,
              },
              { type: 'NormalizeInline', nodeId },
            ];
            let postDeleteState = state;
            for (const op of deleteOps)
              postDeleteState = applyOp(postDeleteState, op);
            const insertOps = insertTextCommand(
              postDeleteState,
              nodeId,
              inlineIndex,
              startOffset,
              ev.data
            );
            controller.dispatch([...deleteOps, ...insertOps], {
              type: 'collapsed',
              nodeId,
              inlineIndex,
              offset: startOffset + ev.data.length,
            });
            return;
          }
          if (sel.type === 'block-range') {
            // Don't delete selected nodes — collapse to the first visible node in
            // the range and insert the typed character at the end of its text.
            const visible = getVisibleNodeIds(state);
            const startIdx = visible.indexOf(sel.startNodeId);
            const endIdx = visible.indexOf(sel.endNodeId);
            if (startIdx === -1 || endIdx === -1) return;
            const landingNodeId = visible[Math.min(startIdx, endIdx)];
            if (!landingNodeId) return;
            const landingNode = state.nodes[landingNodeId];
            const landingInline = landingNode?.inlines[0];
            const insertOffset =
              landingInline && landingInline.type === 'text'
                ? landingInline.text.length
                : 0;
            const insertOps = insertTextCommand(
              state,
              landingNodeId,
              0,
              insertOffset,
              ev.data
            );
            controller.dispatch(insertOps, {
              type: 'collapsed',
              nodeId: landingNodeId,
              inlineIndex: 0,
              offset: insertOffset + ev.data.length,
            });
            return;
          }
          return; // cross-node range: not yet handled
        }

        if (sel.type !== 'collapsed') return;
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

    const handleMouseDown = (e: MouseEvent) => {
      const targetNode = e.target as Node;
      const element =
        targetNode instanceof HTMLElement
          ? targetNode
          : targetNode.parentElement;

      if (!element) return;

      // Don't intercept chevron clicks — those go to the collapse handler in renderer
      if (element.closest('.clutter-node__chevron-wrapper')) return;

      const wrapper = element.closest('[data-node-id]');

      // Click outside the editor — clear block-range selection if one is active.
      if (!wrapper || !el.contains(wrapper)) {
        const controller = controllerRef.current;
        if (controller && !isHandlingInput) {
          const currentSel = controller.getState().selection;
          if (currentSel?.type === 'block-range') {
            // Collapse to the start node so the halo disappears cleanly.
            controller.dispatch([], {
              type: 'collapsed',
              nodeId: currentSel.startNodeId,
              inlineIndex: 0,
              offset: 0,
            });
          }
        }
        return;
      }

      const content = element.closest('.clutter-node__content');
      dragStartedInContentRef.current = !!content;

      const controller = controllerRef.current;
      if (controller) {
        const currentSel = controller.getState().selection;
        if (currentSel?.type === 'block-range') {
          const nodeId = wrapper.getAttribute('data-node-id');
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

      // Always reset to 'caret' on mousedown regardless of where the click landed.
      // Not resetting here would leave selectionModeRef in 'block' from a previous
      // drag, causing the next click to misroute through the block-drag finalization
      // path in handleMouseUp instead of reading the native caret position.
      selectionModeRef.current = 'caret';

      el.focus({ preventScroll: true });

      isMouseSelecting = true;
      isBlockDragging = false;

      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      hasMovedEnoughRef.current = false;
      lastDragEndNodeIdRef.current = null;

      dragStartNodeId = wrapper.getAttribute('data-node-id');
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseSelecting || !dragStartPosRef.current) return;

      const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
      const dy = Math.abs(e.clientY - dragStartPosRef.current.y);

      if (!hasMovedEnoughRef.current) {
        if (dx + dy < 4) return;
        hasMovedEnoughRef.current = true;
      }

      if (!dragStartNodeId) return;

      const controller = controllerRef.current;
      if (!controller) return;

      const target = e.target as HTMLElement;
      const wrapper = target.closest ? target.closest('[data-node-id]') : null;
      let currentNodeId = wrapper?.getAttribute('data-node-id') ?? null;

      // If no node is directly under the cursor (outside editor or in whitespace),
      // find the visible node whose bounding rect is closest to the cursor's Y.
      // Using all visible nodes (not just root children) lets the user drag-select
      // child nodes and handles all four drag directions uniformly.
      let resolvedFromOutside = false;
      if (!currentNodeId && isMouseSelecting) {
        const st = controllerRef.current?.getState();
        if (st) {
          const visibleIds = getVisibleNodeIds(st);
          let closestId: string | null = null;
          let closestDist = Infinity;
          for (const nodeId of visibleIds) {
            const nodeEl = el.querySelector(`[data-node-id="${nodeId}"]`);
            if (!nodeEl) continue;
            const r = nodeEl.getBoundingClientRect();
            if (e.clientY >= r.top && e.clientY <= r.bottom) {
              closestId = nodeId;
              break; // exact Y hit
            }
            const dist = Math.min(
              Math.abs(e.clientY - r.top),
              Math.abs(e.clientY - r.bottom)
            );
            if (dist < closestDist) {
              closestDist = dist;
              closestId = nodeId;
            }
          }
          if (closestId) {
            currentNodeId = closestId;
            resolvedFromOutside = true;
          }
        }
      }

      if (!currentNodeId) return;

      if (currentNodeId === dragStartNodeId) {
        if (resolvedFromOutside) {
          // Y-coordinate resolution landed on the start node (e.g. only one content node,
          // or cursor is at the same vertical level as where the drag started).
          // Don't collapse — keep the current selection unchanged.
          return;
        }
        // User physically moved the cursor back over the start node element.
        // If block drag is already active, shrink the halo to just this one node.
        // If block drag hasn't started yet, native text selection is running — skip.
        if (isBlockDragging && !isHandlingInput) {
          lastDragEndNodeIdRef.current = dragStartNodeId;
          controller.dispatch([], {
            type: 'block-range',
            startNodeId: dragStartNodeId,
            endNodeId: dragStartNodeId,
          });
        }
        return;
      }

      const currentSel = controller.getState().selection;
      if (
        currentSel?.type === 'block-range' &&
        currentSel.startNodeId === dragStartNodeId &&
        currentSel.endNodeId === currentNodeId
      ) {
        return;
      }

      lastDragEndNodeIdRef.current = currentNodeId;

      // First time crossing a node boundary — kill native selection so the
      // browser doesn't fight with our block-range highlight.
      if (!isBlockDragging) {
        isBlockDragging = true;
        const nativeSel = window.getSelection();
        if (nativeSel) nativeSel.removeAllRanges();
      }

      e.preventDefault();
      selectionModeRef.current = 'block';
      el.focus({ preventScroll: true });

      // Dispatch immediately so the halo updates in real time as the user drags.
      // renderEditor only runs when the end node actually changes (the isSame
      // check in dispatch short-circuits if start+end are identical), so this
      // fires at node-boundary frequency, not pixel frequency.
      if (!isHandlingInput) {
        controller.dispatch([], {
          type: 'block-range',
          startNodeId: dragStartNodeId,
          endNodeId: currentNodeId,
        });
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
          // Do NOT call el.focus() here — syncDomSelectionToState inside dispatch
          // already focused a contenteditable child so beforeinput fires for typing.
          // Calling el.focus() again would override that and break keyboard input.
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

      // Only activate block-range if the drag actually crossed a node boundary.
      // Without this guard, an in-content drag that moved > 4px but stayed in the
      // same node would produce a spurious single-node block-range.
      if (dragStartNodeId && lastDragEndNodeIdRef.current) {
        const endNodeId = lastDragEndNodeIdRef.current;
        const currentSel = controller.getState().selection;
        if (
          (!currentSel || currentSel.type !== 'block-range') &&
          !isHandlingInput
        ) {
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

        selectionModeRef.current = sel.type === 'range' ? 'inline' : 'caret';
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

    el.addEventListener('click', handleClick);

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

      el.removeEventListener('click', handleClick);
      el.removeEventListener('focusout', handleFocusOut);
      controllerRef.current = null;
    };
  }, []);

  return <div ref={rootRef} className="clutter-editor" tabIndex={0} />;
}
