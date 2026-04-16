/**
 * Full re-render from EditorState. clutter-node structure. No diffing. No mutation observers.
 */

import { getVisibleNodeIds } from '../engine/engine';
import type { EditorState, Inline, PrimitiveOp } from '../engine/engine';
import type { Selection } from './selection';

export type RenderController = {
  dispatch(ops: PrimitiveOp[], nextSelection?: Selection): void;
};

export function renderEditor(
  state: EditorState,
  rootEl: HTMLElement,
  controller: RenderController
) {
  const root = state.nodes[state.rootId];
  if (!root) return;

  const activeSel = state.selection;

  const existing = new Map<string, HTMLElement>();

  for (const child of Array.from(rootEl.children)) {
    const id = child.getAttribute('data-node-id');
    if (id) existing.set(id, child as HTMLElement);
  }

  const newChildren: HTMLElement[] = [];

  const lastRootChildId: string | null =
    root.children.length > 0
      ? (root.children[root.children.length - 1] ?? null)
      : null;

  for (const childId of root.children) {
    let nodeEl = existing.get(childId);

    if (!nodeEl) {
      nodeEl = document.createElement('div');
    }

    renderNode(state, childId, nodeEl, controller, activeSel, lastRootChildId);

    newChildren.push(nodeEl);
  }

  const existingChildren = Array.from(rootEl.children) as HTMLElement[];

  // Remove elements that are no longer direct root children.
  // Checking state.nodes[id] is wrong — a moved node still exists in state.nodes
  // but is no longer a root child, leaving a stale duplicate in the DOM.
  const rootChildSet = new Set(root.children);
  for (const child of existingChildren) {
    const id = child.getAttribute('data-node-id');
    if (!id || !rootChildSet.has(id)) {
      rootEl.removeChild(child);
    }
  }

  // Insert or move nodes into correct order
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i]!;
    const current = rootEl.children[i];

    if (current !== child) {
      rootEl.insertBefore(child, current ?? null);
    }
  }
}

function isDescendant(
  state: EditorState,
  targetId: string,
  ancestorId: string
): boolean {
  let current = state.nodes[targetId];

  while (current) {
    if (current.parentId === ancestorId) return true;
    if (!current.parentId) return false;
    current = state.nodes[current.parentId];
  }

  return false;
}

function updateNodeClasses(
  wrapper: HTMLElement,
  state: EditorState,
  node: EditorState['nodes'][string],
  _nodeId: string,
  activeSel: Selection | null,
  _lastRootChildId: string | null
): void {
  const isRootChild = node.parentId === state.rootId;
  const isEmpty =
    node.inlines.length === 1 &&
    node.inlines[0]?.type === 'text' &&
    node.inlines[0].text.trim() === '';
  const hasChildren = node.children.length > 0;
  // Systemic = the trailing empty paragraph the root invariant always maintains
  const isSystemic =
    isRootChild && node.id === _lastRootChildId && isEmpty && !hasChildren;

  const activeNodeId =
    activeSel?.type === 'collapsed'
      ? activeSel.nodeId
      : activeSel?.type === 'range'
        ? activeSel.anchor.nodeId
        : activeSel?.type === 'block-range'
          ? activeSel.startNodeId
          : undefined;

  // Dot is visible when the node has something worth marking:
  // has content, has children, is focused, or is the systemic trailing node
  const isDotVisible =
    isSystemic || activeNodeId === node.id || hasChildren || !isEmpty;

  wrapper.classList.toggle('clutter-node--systemic', isSystemic);
  wrapper.classList.toggle('clutter-node--empty', isEmpty);
  wrapper.classList.toggle('clutter-node--active', activeNodeId === node.id);
  wrapper.classList.toggle('clutter-node--has-children', hasChildren);
  wrapper.classList.toggle(
    'clutter-node--collapsed-parent',
    hasChildren && node.collapsed
  );
  wrapper.classList.toggle('clutter-node--dot-visible', isDotVisible);

  if (activeSel?.type === 'block-range') {
    const visible = getVisibleNodeIds(state);
    const startIdx = visible.indexOf(activeSel.startNodeId);
    const endIdx = visible.indexOf(activeSel.endNodeId);

    let inBlockRange = false;

    if (startIdx >= 0 && endIdx >= 0) {
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);

      // Direct hit: this node's visible index is within the selection range.
      const myIdx = visible.indexOf(_nodeId);
      if (myIdx >= minIdx && myIdx <= maxIdx) {
        inBlockRange = true;
      }

      // Ancestor capture: if any ancestor is in range, highlight this node too.
      // This makes expanded children of a selected parent highlight automatically
      // (e.g. drag D→B selects range [B,C,D]; E highlights because its parent B is in range).
      if (!inBlockRange) {
        let curr = node.parentId ? state.nodes[node.parentId] : undefined;
        while (curr && curr.blockType !== 'root') {
          const ancestorIdx = visible.indexOf(curr.id);
          if (ancestorIdx >= minIdx && ancestorIdx <= maxIdx) {
            inBlockRange = true;
            break;
          }
          curr = curr.parentId ? state.nodes[curr.parentId] : undefined;
        }
      }
    }

    wrapper.classList.toggle('clutter-node--block-selected', inBlockRange);
  } else {
    wrapper.classList.remove('clutter-node--block-selected');
  }
}

function syncChildren(
  state: EditorState,
  node: EditorState['nodes'][string],
  wrapper: HTMLElement,
  controller: RenderController,
  activeSel: Selection | null
): void {
  let childrenWrapper = wrapper.querySelector(
    ':scope > .clutter-node__children'
  ) as HTMLElement | null;

  if (!childrenWrapper) {
    childrenWrapper = document.createElement('div');
    childrenWrapper.className = 'clutter-node__children';
    wrapper.appendChild(childrenWrapper);
  }

  const existingChildren = new Map<string, HTMLElement>();

  for (const child of Array.from(childrenWrapper.children)) {
    const id = child.getAttribute('data-node-id');
    if (id) existingChildren.set(id, child as HTMLElement);
  }

  const newChildren: HTMLElement[] = [];

  for (const childId of node.children) {
    let childEl = existingChildren.get(childId);
    if (!childEl) {
      childEl = document.createElement('div');
    }

    renderNode(state, childId, childEl, controller, activeSel, null);
    newChildren.push(childEl);
  }

  // Remove nodes that are no longer children of this node.
  const desiredIds = new Set(node.children);
  for (const child of Array.from(childrenWrapper.children)) {
    const id = child.getAttribute('data-node-id');
    if (!id || !desiredIds.has(id)) {
      childrenWrapper.removeChild(child);
    }
  }

  // Insert or move nodes into correct order without detaching already-correct elements.
  // replaceChildren() always detaches+reattaches every child, which invalidates browser
  // selection even when the same elements are being reused. insertBefore preserves identity.
  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i]!;
    const current = childrenWrapper.children[i];
    if (current !== child) {
      childrenWrapper.insertBefore(child, current ?? null);
    }
  }
}

function renderNode(
  state: EditorState,
  nodeId: string,
  wrapper: HTMLElement,
  controller: RenderController,
  activeSel: Selection | null,
  _lastRootChildId: string | null
) {
  const node = state.nodes[nodeId];
  if (!node) return;

  wrapper.className = 'clutter-node';
  wrapper.dataset.nodeId = nodeId;

  updateNodeClasses(wrapper, state, node, nodeId, activeSel, _lastRootChildId);

  let inner = wrapper.querySelector(
    ':scope > .clutter-node__inner'
  ) as HTMLElement | null;

  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'clutter-node__inner';
    wrapper.appendChild(inner);
  }

  let bulletSlot = inner.querySelector<HTMLElement>(
    '.clutter-node__bullet-slot'
  );
  if (!bulletSlot) {
    bulletSlot = document.createElement('div');
    bulletSlot.className = 'clutter-node__bullet-slot';

    const bulletHit = document.createElement('div');
    bulletHit.className = 'clutter-node__bullet-hit';

    const bullet = document.createElement('span');
    bullet.className = 'clutter-node__bullet';
    bulletHit.appendChild(bullet);
    bulletSlot.appendChild(bulletHit);

    inner.insertBefore(bulletSlot, inner.firstChild);
  }

  if (node.children.length > 0) {
    let chevronWrapper = bulletSlot.querySelector<HTMLElement>(
      '.clutter-node__chevron-wrapper'
    );
    if (!chevronWrapper) {
      chevronWrapper = document.createElement('div');
      chevronWrapper.className = 'clutter-node__chevron-wrapper';

      const chevron = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg'
      );

      chevron.setAttribute('data-chevron', 'svg');
      chevron.setAttribute('viewBox', '0 0 256 256');
      chevron.setAttribute('width', '14');
      chevron.setAttribute('height', '14');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '16');
      chevron.setAttribute('stroke-linecap', 'round');
      chevron.setAttribute('stroke-linejoin', 'round');

      chevron.classList.add('clutter-node__chevron');

      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );

      path.setAttribute('d', 'M96 48l64 80-64 80');

      chevron.appendChild(path);

      chevronWrapper.appendChild(chevron);
      bulletSlot.appendChild(chevronWrapper);
    }

    // Always reassign onclick so it captures the current `node` and `activeSel`.
    // Assigning only at creation leaves a stale closure where node.collapsed is
    // always the initial value — toggle would then always collapse, never expand.
    chevronWrapper.onclick = () => {
      const willCollapse = !node.collapsed;

      const ops: PrimitiveOp[] = [
        {
          type: 'ToggleCollapse',
          nodeId: node.id,
          from: node.collapsed,
          to: willCollapse,
        },
      ];

      let nextSelection: Selection | undefined = undefined;

      if (willCollapse && activeSel) {
        const activeNodeId =
          activeSel.type === 'collapsed'
            ? activeSel.nodeId
            : activeSel.type === 'range'
              ? activeSel.anchor.nodeId
              : activeSel.type === 'block-range'
                ? activeSel.startNodeId
                : undefined;

        if (activeNodeId && isDescendant(state, activeNodeId, node.id)) {
          nextSelection = {
            type: 'collapsed',
            nodeId: node.id,
            inlineIndex: 0,
            offset: 0,
          };
        }
      }

      controller.dispatch(ops, nextSelection);
    };

    const chevron = chevronWrapper.querySelector('.clutter-node__chevron');
    if (chevron) {
      chevron.classList.toggle('is-collapsed', node.collapsed);
      chevron.classList.toggle('is-expanded', !node.collapsed);
    }
  } else {
    const chevronWrapper = bulletSlot.querySelector(
      '.clutter-node__chevron-wrapper'
    );
    if (chevronWrapper) chevronWrapper.remove();
  }

  let content = inner.querySelector(
    ':scope > .clutter-node__content'
  ) as HTMLElement | null;

  if (!content) {
    content = document.createElement('div');
    content.className = 'clutter-node__content';
    content.contentEditable = 'true';
    inner.appendChild(content);
  }

  renderInlines(node.inlines, content);

  if (!wrapper.contains(inner)) {
    wrapper.appendChild(inner);
  }

  if (!node.collapsed && node.children.length > 0) {
    syncChildren(state, node, wrapper, controller, activeSel);
  } else {
    const childrenWrapper = wrapper.querySelector('.clutter-node__children');
    if (childrenWrapper) childrenWrapper.remove();
  }
}

function renderInlines(inlines: Inline[], container: HTMLElement) {
  const inline = inlines[0]; // normalized model: single text segment

  let span = container.querySelector(':scope > span') as HTMLSpanElement | null;

  if (!span) {
    span = document.createElement('span');
    container.appendChild(span);
  }

  const newText = inline && inline.type === 'text' ? inline.text : '';

  // Mutate the existing text node's value rather than reassigning span.textContent.
  // span.textContent = x removes and recreates the text node, which invalidates any
  // browser Selection that was anchored to the old text node — causing caret loss
  // on every keystroke. Mutating nodeValue keeps the same text node alive.
  const existingTextNode = span.firstChild;
  if (existingTextNode && existingTextNode.nodeType === Node.TEXT_NODE) {
    if (existingTextNode.nodeValue !== newText) {
      existingTextNode.nodeValue = newText;
    }
    // Remove any unexpected extra children after the text node.
    while (span.childNodes.length > 1) {
      span.removeChild(span.lastChild!);
    }
  } else {
    // First render: no text node yet — textContent assignment is safe here.
    span.textContent = newText;
  }

  // Remove extra spans if they somehow exist.
  const allSpans = container.querySelectorAll(':scope > span');
  if (allSpans.length > 1) {
    for (let i = 1; i < allSpans.length; i++) {
      const el = allSpans[i];
      if (el) el.remove();
    }
  }
}
