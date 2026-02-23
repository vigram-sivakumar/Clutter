/**
 * Full re-render from EditorState. clutter-node structure. No diffing. No mutation observers.
 */

import type { EditorState, Inline, PrimitiveOp } from '../engine/engine';

export type RenderController = {
  dispatch(label: string, ops: PrimitiveOp[]): void;
};

export function renderEditor(
  state: EditorState,
  rootEl: HTMLElement,
  controller: RenderController
) {
  rootEl.innerHTML = '';

  const root = state.nodes[state.rootId];
  if (!root) return;

  for (const childId of root.children) {
    renderNode(state, childId, rootEl, controller);
  }
}

function renderNode(
  state: EditorState,
  nodeId: string,
  container: HTMLElement,
  controller: RenderController
) {
  const node = state.nodes[nodeId];
  if (!node) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'clutter-node';
  wrapper.dataset.nodeId = node.id;

  if (node.collapsed && node.children.length > 0) {
    wrapper.classList.add('clutter-node--collapsed-parent');
  }

  const isEmpty =
    node.inlines.length === 1 &&
    node.inlines[0].type === 'text' &&
    node.inlines[0].text === '';

  if (isEmpty) {
    wrapper.classList.add('clutter-node--empty');
  }

  const inner = document.createElement('div');
  inner.className = 'clutter-node__inner';

  const bulletSlot = document.createElement('div');
  bulletSlot.className = 'clutter-node__bullet-slot';

  const bulletHit = document.createElement('div');
  bulletHit.className = 'clutter-node__bullet-hit';

  const ring = document.createElement('span');
  ring.className = 'clutter-node__ring';

  const dot = document.createElement('span');
  dot.className = 'clutter-node__dot';

  bulletHit.appendChild(ring);
  bulletHit.appendChild(dot);
  bulletSlot.appendChild(bulletHit);

  if (node.children.length > 0) {
    const chevronWrapper = document.createElement('div');
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

    if (node.collapsed) {
      chevron.classList.add('is-collapsed');
    } else {
      chevron.classList.add('is-expanded');
    }

    const path = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    );

    path.setAttribute('d', 'M96 48l64 80-64 80');

    chevron.appendChild(path);

    chevronWrapper.appendChild(chevron);
    chevronWrapper.addEventListener('click', () => {
      const ops: PrimitiveOp[] = [
        {
          type: 'ToggleCollapse',
          nodeId: node.id,
          from: node.collapsed,
          to: !node.collapsed,
        },
      ];
      controller.dispatch('toggleCollapse', ops);
    });

    bulletSlot.appendChild(chevronWrapper);
  }

  inner.appendChild(bulletSlot);

  const content = document.createElement('div');
  content.className = 'clutter-node__content';
  content.contentEditable = 'true';

  renderInlines(node.inlines, content);

  inner.appendChild(content);
  wrapper.appendChild(inner);
  container.appendChild(wrapper);

  if (!node.collapsed) {
    if (node.children.length > 0) {
      const childrenWrapper = document.createElement('div');
      childrenWrapper.className = 'clutter-node__children';
      childrenWrapper.style.marginLeft = '24px';

      for (const childId of node.children) {
        renderNode(state, childId, childrenWrapper, controller);
      }

      wrapper.appendChild(childrenWrapper);
    }
  }
}

function renderInlines(inlines: Inline[], container: HTMLElement) {
  for (const inline of inlines) {
    if (inline.type === 'text') {
      const span = document.createElement('span');
      span.textContent = inline.text;

      for (const mark of inline.marks) {
        if (mark.type === 'bold') span.style.fontWeight = 'bold';
        if (mark.type === 'italic') span.style.fontStyle = 'italic';
        if (mark.type === 'underline') span.style.textDecoration = 'underline';
      }

      container.appendChild(span);
    }
  }
}
