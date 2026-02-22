import { useEffect, useRef } from 'react';
import type { Node, NodeID } from './model';
import type { Dispatch } from 'react';
import type { Action } from './reducer';
import { Icons } from '../design-system/icons';
import { layoutTokens } from '../design-system/tokens';

type NodeRowProps = {
  node: Node;
  depth: number;
  isActive: boolean;
  nodes: Node[];
  collapsed: Set<NodeID>;
  dispatch: Dispatch<Action>;
  /** When true, render only the inner (bullet-slot + content) for use inside tree node wrapper */
  renderInnerOnly?: boolean;
};

export function NodeRow({
  node,
  depth,
  isActive,
  nodes,
  collapsed,
  dispatch,
  renderInnerOnly = false,
}: NodeRowProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const hasChildren = nodes.some((n) => n.parentId === node.id);
  const isCollapsed = collapsed.has(node.id);
  const showRing = hasChildren && isCollapsed;

  const rootNodes = nodes.filter((n) => n.parentId === null);
  const lastRoot = rootNodes[rootNodes.length - 1];
  const isSystemic =
    node.parentId === null && lastRoot != null && node.id === lastRoot.id;

  // Systemic empty is not "active" until user types in it (so dot stays subtle)
  const effectiveActive =
    isActive && (!isSystemic || node.text.trim() !== '');

  const isEmpty = node.text.trim() === '';

  const handleToggle = () => {
    if (hasChildren) dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: node.id });
  };

  // Only sync DOM when text changes structurally (ENTER, BACKSPACE, etc)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (el.textContent !== node.text) {
      el.textContent = node.text;
    }
  }, [node.text]);

  const inner = (
    <div className="clutter-node__inner">
      <div className="clutter-node__bullet-slot">
        {hasChildren && (
          <div
            className="clutter-node__chevron-wrapper"
            onClick={handleToggle}
          >
            <Icons.CaretRight
              size={14}
              weight="fill"
              className={`clutter-node__chevron ${
                isCollapsed ? 'is-collapsed' : 'is-expanded'
              }`}
            />
          </div>
        )}
        <div className="clutter-node__bullet-hit">
          <span className="clutter-node__ring" />
          <span className="clutter-node__dot" />
        </div>
      </div>

      <div
        ref={contentRef}
        className="clutter-node__content"
        data-node-id={node.id}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) =>
          dispatch({
            type: 'UPDATE_TEXT',
            nodeId: node.id,
            text: (e.target as HTMLElement).innerText ?? '',
          })
        }
      />
    </div>
  );

  if (renderInnerOnly) return inner;

  const INDENT = layoutTokens.indent;
  return (
    <div
      className={`clutter-node ${isSystemic ? 'clutter-node--systemic' : ''} ${isEmpty ? 'clutter-node--empty' : ''} ${showRing ? 'clutter-node--collapsed-parent' : ''}`}
      data-active={effectiveActive}
      data-depth={depth}
      style={{ '--indent': `${INDENT}px` } as React.CSSProperties}
    >
      {inner}
    </div>
  );
}
