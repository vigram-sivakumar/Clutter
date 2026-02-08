import {
  Node,
  NodeID,
} from './NodeKernel';

/**
 * SEGMENTED ARCHITECTURE — Cursor Position
 * 
 * NO BIAS. NO GLOBAL OFFSETS.
 * 
 * Cursor identifies:
 * - Which node
 * - Which segment (by index in segments array)
 * - Local offset inside that segment
 * 
 * Caret anchors make "before/after inline" explicit in DOM.
 * No calculation needed.
 */
export interface CursorPosition {
  nodeId: NodeID;
  segmentIndex: number;  // Which segment in node.segments[]
  offset: number;        // LOCAL offset inside that segment (0 for caret-anchor)
}

/**
 * Editor State - SEGMENTED ARCHITECTURE
 * 
 * Pure data structure. No behavior.
 * Cursor is observed from browser, not "intended".
 */
export interface EditorState {
  nodes: Node[];
  cursor: CursorPosition;
  selection?: {
    anchor: CursorPosition;
    focus: CursorPosition;
  };
}
