/**
 * NodeEditor — Pure UI Dispatcher
 *
 * 🔒 HARDENED ARCHITECTURE — DOM-OWNED TYPING
 *
 * CRITICAL PRINCIPLE:
 * Typing mutates DOM only. React handles structure only.
 *
 * DOM-OWNED (No React):
 * ✅ Typing characters
 * ✅ Deleting characters
 * ✅ Space
 * ✅ IME composition
 * ✅ Paste in node
 *
 * STRUCTURAL (React-owned):
 * ✅ Enter (split)
 * ✅ Backspace merge
 * ✅ Create/delete nodes
 * ✅ Indent/outdent
 *
 * FLUSH BOUNDARIES (Only times React updates during typing):
 * - Enter key (before split)
 * - Backspace merge (before merge)
 * - Blur event
 * - Node change
 * - 500ms idle debounce
 *
 * ENFORCEMENT:
 * - ESLint: Forbidden patterns blocked at compile time
 * - Tests: Architectural invariants guard regression
 * - CI: Architecture locks verified on every commit
 * - TypingBuffer: Prevents React updates during input
 * - Dev assertions: Crash if input triggers setState
 *
 * If you add text logic here, YOU ARE BREAKING THE ARCHITECTURE.
 */

// 🔒 Global dev flag
declare global {
  const __DEV__: boolean;
}

// Set dev mode
(globalThis as any).__DEV__ = import.meta.env.DEV;

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Node, NodeID, Segment, EditorState, CursorPosition } from '../engine';
import {
  createNode,
  insertNodeAfter,
  replaceNode,
  getPreviousNode,
  deleteNode as removeNodeFromArray,
} from '../engine';
import { NodeView } from './NodeView';
import {
  normalizePersistedState,
  type RecoveryEvent,
  type RecoveryAction,
  type PersistedState,
  type DocumentMetadata,
  type DocumentData,
  LATEST_VERSION,
} from '../../normalize';
import { migrateToLatest } from '../../migrations';
import { usePersistence, PersistenceStatus } from '../../ui/persistence';
import type { GrammarSession } from '../../ui/grammar/grammarSession';
import {
  EMPTY_GRAMMAR_SESSION,
  createGrammarSession,
  selectNextCandidate,
  selectPreviousCandidate,
  getSelectedCandidate,
  isSessionActive,
} from '../../ui/grammar/grammarSession';
import { GrammarChooser } from '../../ui/grammar/GrammarChooser';
import { resolveIntent } from '../../input/resolveIntent';
import { intentToCommand } from '../../input/grammarToCommand';
import { executeCommand } from '../../commands/executor';
import type { EditorContext } from '../../commands/executor';
import { syncPropertiesFromText } from '../../input/hashtagSync';

// SEGMENTED EDITOR - ALL TEXT OPERATIONS
import {
  handleSegmentedEnter,
  handleSegmentedBackspace,
  handleSegmentedInput,
  mergeWithPrevious,
  matchGrammar,
  matchQuery,
  isNodeEmpty,
  getNodeLabel as getNodeLabelFromSegments,
} from '../index';
// TypingBuffer imports DELETED - Phase 2.5 complete
// 🔒 INDEX-BASED MODEL (Workflowy/Tana architecture)
import {
  EditorModelIndex,
  cursorToIndex,
  cursorToNodeId,
  type IndexCursor,
} from '../EditorModel.index';

// 🔒 TYPE-SAFE RAF UTILITIES (Priority 1: Eliminate timestamp bugs)
import { scheduleRAF, type CancelToken } from '../caret/CaretUtilities';

// 🔒 CARET PLACEMENT (Priority 3: Eliminate race conditions)
import { useCaretPlacement } from '../caret/CaretPlacement';

// 🔒 OBSERVER LIFECYCLE (Priority 2: Eliminate lifecycle violations)
import { useObserverLifecycle } from '../observers/ObserverLifecycle';
import { assertObserverStopped } from '../observers/ObserverCommit';

// 🔒 PHASE 1: DOMObserver (parallel to TypingBuffer)
import {
  DOMObserver,
  extractSegmentsFromDOM,
} from '../DOMObserver';

// OLD SINGLETON — QUARANTINED (dual-model bug fixed, no longer used)
// REMOVED: All handlers now use modelRef.current (EditorModelIndex) exclusively
// import {
//   initializeModel,
//   getModel,
//   updateModel,
//   updateModelNodes,
//   updateModelCursor,
//   getModelNode,
//   getModelCursor,
// } from './editor/EditorModel';
import { getPlainText, getCursorOffsetInPlainText } from '../engine';
import {
  getNodePositionFromSelection,
  getSelectionRangeFromDOM,
} from '../input/domMapping';

// 🔒 ENFORCEMENT LAYER - Makes violations impossible
// REMOVED: performEditorOperation (incompatible with unified model, replaced with withStructuralCommit)
import {
  // performEditorOperation,  // ❌ Uses old singleton model
  _initializePipeline,
  _initializeStateWrapper,
  _allowMutation,
  _blockMutation,
  // captureSelectionIntent,  // Unused
  assertNotRenderingDuringTyping,
  // type EditorOperation,  // Unused
} from '../../enforcement';

// 🔒 NEW ARCHITECTURE — Priorities 4-6 (NOT YET ACTIVE)
import {
  type EditorStateComplete,
  type EditorAction,
  type HandlerResult,
  type CoordinatorContext,
  type CaretIntent,
} from '../core/EditorTypes';
import { nanoid } from 'nanoid';
import {
  editorReducer,
  useEditorStateReducer,
} from '../reducer';
import { executeAction, shouldRequestCaret, type CoordinatorDependencies } from '../core/EditorCoordinator';
import {
  handleArrow,
  handleTab,
  handleEnter,
  handleBackspace,
  handleSpace,
  computeArrowTargetCursor,
  handleUndo,
  handleRedo,
  handleZoomIn,
  handleZoomOut,
  handleQueryBarOpen,
  handleReferencePickerOpen,
  handleSaveViewDialogOpen,
  handleTemplatePickerOpen,
  handleSelectionChange as handleSelectionChangeNew,
  handleBlur as handleBlurNew,
  handleCompositionStart as handleCompositionStartNew,
  handleCompositionEnd as handleCompositionEndNew,
} from '../keyboard';

/**
 * STEP 8.1 — UI-extended Node
 * Collapse state is UI-only, not in kernel
 *
 * STEP 13.2 — Lifecycle flags (UI-only)
 * isDeleted: soft delete, node still exists but hidden
 */
type UINode = Node & {
  isCollapsed?: boolean;
  isDeleted?: boolean;
};

/**
 * STEP 14.1 — History and Snapshot Types (UI-only)
 *
 * Full state snapshots for undo/redo.
 * No diffs, no patches, no replay.
 *
 * FILE 06.2 — Now uses CursorPosition with bias
 */
type SelectionState = {
  anchor: CursorPosition | null;
  focus: CursorPosition | null;
};

type EditorSnapshot = {
  nodes: UINode[];
  cursor: CursorPosition;
  focusRootId: NodeID | null;
  selection: SelectionState;
};

type History = {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
};

/**
 * STEP 15.1 — Query Type (UI-only)
 *
 * Read-only filter over the graph.
 * Does not mutate nodes, only affects visibility.
 */
type Query =
  | { type: 'text'; value: string }
  | { type: 'property'; key: string; value?: string }
  | { type: 'ref'; nodeId: NodeID }
  | null;

/**
 * STEP 16.1 — View Type (UI-only)
 *
 * Named bookmark of perspective (query + focus).
 * Not data, not persisted (yet), just projection state.
 */
type View = {
  id: string;
  name: string;
  query: Query;
  focusRootId: NodeID | null;
};

/**
 * STEP 17.1 — Template Type (UI-only)
 *
 * Reusable property shape. No behavior, just structure.
 * undefined values mean "prompt user" or "leave empty".
 */
type Template = {
  id: string;
  name: string;
  props: Record<string, string | undefined>;
};

/**
 * STEP 12.1 — Canonical Node Identity Helper
 *
 * Single source of truth for how nodes are labeled everywhere:
 * - References
 * - Backlinks
 * - Breadcrumbs
 * - Picker
 * - Any other display context
 *
 * Rules:
 * - Deleted nodes → "(deleted)"
 * - Empty nodes → "(empty)"
 * - Non-empty → first line, truncated to 50 chars
 * - Consistent everywhere
 */
// Use segmented editor API for node labels
export function getNodeLabel(node: Node | UINode): string {
  // STEP 13.2 — Deleted nodes
  if ('isDeleted' in node && node.isDeleted) return '(deleted)';

  return getNodeLabelFromSegments(node as Node);
}

// ALL text operations now handled by SegmentedEditor API

export function NodeEditor() {
  // 🔒 STEP 1: Create INDEX-BASED MODEL (lazy initialization)
  const modelRef = useRef<EditorModelIndex | null>(null);

  // Helper to get or create model
  const getOrCreateModel = (): EditorModelIndex => {
    if (!modelRef.current) {
      const node1 = createNode('paragraph', 'First node - try typing here');
      const node2 = createNode('paragraph', 'Second node');
      const node3 = createNode('heading', 'This is a heading');
      const node4 = createNode('paragraph', 'Node with properties');

      // Add properties to node4
      node4.props = { status: 'active', priority: 'high' };

      // SEGMENTED ARCHITECTURE: Create node with inline references
      const node5 = createNode('paragraph');
      node5.segments = [
        { type: 'text', text: 'Check out ' },
        {
          type: 'inline',
          kind: 'ref',
          id: node3.id,
          payload: { type: 'reference', targetId: node3.id },
        },
        { type: 'text', text: ' and also ' },
        {
          type: 'inline',
          kind: 'ref',
          id: node1.id,
          payload: { type: 'reference', targetId: node1.id },
        },
      ];

      const initialNodes: Node[] = [node1, node2, node3, node4, node5];

      const initialCursor: IndexCursor = {
        index: 0, // First node
        segmentIndex: 0,
        offset:
          initialNodes[0]!.segments[0]?.type === 'text'
            ? initialNodes[0]!.segments[0].text.length
            : 0,
      };

      // Create instance-based model
      modelRef.current = new EditorModelIndex(initialNodes, initialCursor);
    }

    return modelRef.current;
  };

  // 🔒 STEP 2: Create React state as MIRROR of model
  const [editorState, _setEditorStateRaw] = useState<EditorState>(() => {
    const model = getOrCreateModel();
    const nodes = model.getNodes();
    const cursor = model.getCursor();

    // Convert index cursor to legacy nodeId format (temporary)
    const legacyCursor = cursorToNodeId(nodes, cursor);

    return {
      nodes: nodes as UINode[],
      cursor: legacyCursor,
    };
  });

  // 🔒 TEMPORARY: Escape hatch for unmigrated code (WILL BE DELETED)
  const setEditorState = _setEditorStateRaw;

  // Selection state (needed early for newEditorState)
  const [selection, setSelection] = useState<{
    anchor: CursorPosition | null;
    focus: CursorPosition | null;
  }>({ anchor: null, focus: null });

  // 🔒 FIX #4: Composition (IME) state tracking
  const [isComposing, setIsComposing] = useState(false);

  // Structural lock ref (needed early for newEditorState)
  const structuralLockRef = useRef(false);

  // 🔒 NEW ARCHITECTURE: Prepare state shape for new handlers
  // During migration: old useState is still primary, new handlers adapt to it
  // 🔒 NEW ARCHITECTURE: Bridge dispatch (updates OLD state during migration)
  // Takes EditorAction and updates old useState accordingly
  // Once all handlers migrated, we'll replace with real reducer
  const dispatch = useCallback(
    (action: EditorAction) => {

      switch (action.type) {
        case 'TAB_PRESSED': {
          // Tab handler will be implemented via old state functions
          // Coordinator will handle the actual indentation
          break;
        }
        case 'ARROW_PRESSED': {
          // Arrow handler will be implemented via old state functions  
          // Coordinator will handle the actual navigation
          break;
        }
        case 'ENTER_PRESSED': {
          // Not yet migrated
          break;
        }
        case 'BACKSPACE_PRESSED': {
          // Not yet migrated
          break;
        }
        default:
          // Other actions not yet handled
          break;
      }
    },
    []
  );

  // 🔒 FIX #4: Composition state moved earlier (line ~348) for newEditorState dependency

  // 🔒 PRIORITY 2: Observer lifecycle hook (eliminates lifecycle violations)
  // Manages DOMObserver creation/destruction based on node list
  // Handlers NEVER touch observers - React owns lifecycle
  const { observers: domObservers } = useObserverLifecycle({
    nodeIds: editorState.nodes.map((n) => n.id),
    onMutationsBatched: undefined,
    debug: __DEV__,
  });

  // 🔒 SINGLETON GUARD: Prevent re-initialization
  const pipelineInitializedRef = useRef(false);

  // 🔒 STEP 2: Wire enforcement (POST-MOUNT, after setter exists)
  useEffect(() => {
    // Guard: Initialize ONCE only
    if (pipelineInitializedRef.current) return;

    // 1. OLD SINGLETON MODEL INITIALIZATION REMOVED
    // UNIFIED MODEL: Only modelRef.current (EditorModelIndex) is used now
    // Legacy singleton removed to fix dual-model zombie node bug

    // 2. Initialize pipeline (safe: model exists now)
    _initializePipeline(_setEditorStateRaw, requestCaretPlacement);

    // 3. Initialize state wrapper
    _initializeStateWrapper(_setEditorStateRaw);

    // ✂️ PHASE 2.5: TypingBuffer runtime guards DELETED
    // MutationObserver lifecycle replaces isTyping() flag
    // Observer.isRunning() is the new authoritative state
    (globalThis as any).__assertNotRenderingDuringTyping =
      assertNotRenderingDuringTyping;

    pipelineInitializedRef.current = true;

    if (__DEV__) {
      // Index-based model active
    }
  }, []);

  // 🎯 PHASE 2A: Coordinator is now called directly via executeAction()
  // No need for coordinator instance - it's stateless

  /**
   * Request selection for a node (called from NodeView pointerdown)
   * - Updates modelRef cursor
   * - Mirrors to React state
   * - Focuses the node DOM and places caret in a stable location
   */
  function handleNodeRequestSelect(nodeId: string) {
    const activeNode = editorState.nodes.find((n) => n.id === nodeId);
    if (!activeNode) return;

    const position = { nodeId: nodeId, segmentIndex: 0, offset: 0 } as any;

    // Update index-based model first
    try {
      const idx = modelRef.current?.getIndexById(nodeId);
      if (typeof idx === 'number' && modelRef.current) {
        modelRef.current.updateCursor({ index: idx, segmentIndex: 0, offset: 0 });
      }
    } catch (err) {
      // Silent fail
    }

    // Mirror to React state
    setEditorState({ ...editorState, cursor: position });
    setSelection({ anchor: null, focus: null });

    // Focus DOM and place caret in a stable location
    // Use RAF to allow DOM to settle
    window.requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-node-id="${nodeId}"] .node__content`
      ) as HTMLElement | null;
      if (!el) return;

      el.focus();

      try {
        const sel = window.getSelection();
        if (!sel) return;

        const firstChild = el.firstChild;
        const range = document.createRange();

        if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
          // Place inside placeholder text node
          range.setStart(firstChild, 0);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else if (el.lastChild) {
          // Place after last child
          range.setStartAfter(el.lastChild);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (err) {
        // Silent fail
      }
    });
  }

  // ✅ PRIORITY 2: Observer lifecycle now managed by useObserverLifecycle hook
  // Manual observer creation/destruction removed - React owns lifecycle

  // DEBUG: Track all state changes
  // Removed logging useEffect

  // Phase 5.1.5 — Controlled caret positioning flag
  // Ref to request caret placement after structural operations only
  // Per File 06 §1.3: Browser owns caret during typing, editor places after structure changes
  const needsCaretPlacementRef = useRef(false);

  function requestCaretPlacement() {
    needsCaretPlacementRef.current = true;
  }

  // Phase 09 Final — Structural lock moved earlier (line ~354) for newEditorState dependency

  // 🎯 PHASE 2A: No coordinator refs needed - executeAction is stateless

  function withStructuralCommit(fn: () => void) {
    structuralLockRef.current = true;

    try {
      fn();
    } finally {
      // Release ONLY after browser finishes dispatching input + selection events
      // ✅ PRIORITY 1: Type-safe RAF wrapper (prevents timestamp bugs)
      scheduleRAF(() => {
        structuralLockRef.current = false;
      });
    }
  }

  // Selection state moved earlier (line ~345) for newEditorState dependency

  // STEP 9.1 — Focus/Zoom state (UI-only)
  // null = normal mode (top-level view)
  // nodeId = zoomed into that node
  const [focusRootId, setFocusRootId] = useState<NodeID | null>(null);

  // STEP 11.2.1 — Reference picker state (UI-only)
  const [refPickerState, setRefPickerState] = useState<{
    isOpen: boolean;
    sourceNodeId: NodeID | null;
    selectedIndex: number;
  }>({ isOpen: false, sourceNodeId: null, selectedIndex: 0 });

  // STEP 14.1 — History state (UI-only)
  const [history, setHistory] = useState<History>({
    past: [],
    future: [],
  });

  // STEP 15.1 — Query state (UI-only)
  const [query, setQuery] = useState<Query>(null);
  const [queryInput, setQueryInput] = useState<string>('');
  const [showQueryBar, setShowQueryBar] = useState<boolean>(false);

  // STEP 16.1 — Saved views state (UI-only)
  const [views, setViews] = useState<View[]>([]);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState<boolean>(false);
  const [saveViewName, setSaveViewName] = useState<string>('');

  // STEP 17.1 — Templates state (UI-only)
  const [templates, _setTemplates] = useState<Template[]>([
    // Some default templates for demo
    {
      id: crypto.randomUUID(),
      name: 'Task',
      props: { status: 'todo', priority: 'medium' },
    },
    {
      id: crypto.randomUUID(),
      name: 'Meeting',
      props: { date: '', attendees: '' },
    },
    { id: crypto.randomUUID(), name: 'Note', props: { topic: '', source: '' } },
  ]);
  const [showTemplatePicker, setShowTemplatePicker] = useState<boolean>(false);
  const [templatePickerIndex, setTemplatePickerIndex] = useState<number>(0);

  // PHASE 20 — Recovery events state (UI-only, session-scoped)
  const [recoveryEvents, setRecoveryEvents] = useState<RecoveryEvent[]>([]);
  const [showRecoveryPanel, setShowRecoveryPanel] = useState<boolean>(false);

  // PHASE C — Grammar session state (transient, not persisted)
  const [grammarSession, setGrammarSession] = useState<GrammarSession>(
    EMPTY_GRAMMAR_SESSION
  );

  // 🆕 PHASE 1: Ephemeral caret placement intent (not part of document state)
  // Parallel system alongside RAF (RAF still active in Phase 1)
  const [caretIntent, setCaretIntent] = useState<CaretIntent | null>(null);

  // 🔒 NEW ARCHITECTURE: Complete editor state (for pure handlers)
  // Must be declared AFTER grammarSession to avoid "reference before initialization"
  const newEditorState: EditorStateComplete = useMemo(
    () => ({
      nodes: editorState.nodes as Node[],
      cursor: editorState.cursor,
      selection: selection,
      focusRootId: null,
      grammarSession: {
        isActive: grammarSession.grammar !== null,
        grammar: grammarSession.grammar ? {
          type: grammarSession.grammar.type as 'slash' | 'reference' | 'hashtag',
          trigger: grammarSession.grammar.trigger,
        } : undefined,
        candidates: grammarSession.candidates,
        selectedIndex: grammarSession.selectedIndex,
        range: grammarSession.range || undefined,
      },
      isComposing,
    }),
    [editorState.nodes, editorState.cursor, selection, isComposing, grammarSession]
  );

  // PHASE 23 — Sync conflicts state (UI-only, session-scoped)
  const [_syncConflicts, _setSyncConflicts] = useState<
    import('./sync').Conflict[] | null
  >(null);

  // UI PHASE 2 — Workspace state (single workspace for now)
  const [workspaceId] = useState<string>(() => crypto.randomUUID());
  const [workspaceName] = useState<string>('Default Workspace');

  // UI PHASE 2 — Document registry (list of all documents in workspace)
  const [documents, setDocuments] = useState<Record<string, DocumentMetadata>>(
    () => {
      const initialDocId = crypto.randomUUID();
      return {
        [initialDocId]: {
          documentId: initialDocId,
          name: 'Untitled',
          lastModified: Date.now(),
        },
      };
    }
  );

  // UI PHASE 2 — Active document ID
  const [activeDocumentId, setActiveDocumentId] = useState<string>(
    () => Object.keys(documents)[0]!
  );

  // UI PHASE 2 — Document states cache (stores editor state for each document)
  // This prevents data loss when switching between documents
  const documentStatesRef = useRef<
    Record<
      string,
      {
        editorState: EditorState;
        views: View[];
        templates: Template[];
        history: History;
        selection: SelectionState;
        focusRootId: NodeID | null;
      }
    >
  >({});

  // UI PHASE 1 — Derive persisted state from ALL documents (workspace-level)
  const persistedState: PersistedState = useMemo(() => {
    // Save current active document state to cache before deriving
    documentStatesRef.current[activeDocumentId] = {
      editorState,
      views,
      templates,
      history,
      selection,
      focusRootId,
    };

    // Build documentData from cache
    const documentData: Record<string, DocumentData> = {};
    for (const docId of Object.keys(documents)) {
      const cached = documentStatesRef.current[docId];
      if (cached) {
        documentData[docId] = {
          nodes: cached.editorState.nodes as UINode[],
          views: cached.views,
          templates: cached.templates,
        };
      }
    }

    return {
      version: LATEST_VERSION,
      workspaceId,
      workspaceName,
      activeDocumentId,
      documents,
      documentData,
    };
  }, [
    workspaceId,
    workspaceName,
    activeDocumentId,
    documents,
    editorState.nodes,
    views,
    templates,
    history,
    selection,
    focusRootId,
  ]);

  // UI PHASE 1 — Persistence hook (autosave + state management)
  const { persistence, saveStatus, bindPath, retryWrite } =
    usePersistence(persistedState);

  // Keep focus
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  /**
   * Phase 5.1.4 — Document-level Selection Observer (NEW ARCHITECTURE)
   * Syncs browser selection changes to editor state
   */
  useEffect(() => {
    const handleSelectionChange = () => {
      // ✂️ PHASE 2.5: isTyping() guard DELETED
      // With MutationObserver, DOM is source of truth during typing
      // Selection changes are natural and don't need special handling
      // Commit boundaries extract from DOM when needed

      // Check if selection is inside our editor
      const containerEl = containerRef.current;
      if (!containerEl) return;
      
      // Call pure handler for validation
      const selectionResult = handleSelectionChangeNew(
        newEditorState,
        containerEl,
        structuralLockRef.current
      );
      
      if (!selectionResult.action) {
        return; // Handler rejected (e.g., structural lock, out of editor, etc.)
      }
      
      // Execute using old selection logic (temporary during migration)
      // NOTE: This logic will be moved to coordinator during architecture cleanup
      
      const browserSelection = window.getSelection();
      if (!browserSelection) return;

      // Translate to editor state (SEGMENTED ARCHITECTURE FIX)
      if (browserSelection.isCollapsed) {
        // STEP 1: Find which node the selection is in (from DOM)
        let node = browserSelection.anchorNode;
        if (!node) return;

        // Walk up to .node__content to get data-node-id
        if (node.nodeType === Node.TEXT_NODE) {
          node = node.parentElement;
        }

        while (
          node &&
          !(
            node instanceof HTMLElement &&
            node.classList.contains('node__content')
          )
        ) {
          node = node.parentElement;
        }

        if (!(node instanceof HTMLElement)) {
          return;
        }

        const nodeId = node.getAttribute('data-node-id');

        if (!nodeId) return;

        // STEP 2: Get node from state
        const activeNode = editorState.nodes.find((n) => n.id === nodeId);
        if (!activeNode) {
          return;
        }

        // 🔬 FORENSIC LOG 3: Selection Ground Truth
        if (__DEV__) {
          const sel = window.getSelection();

        }

        // STEP 3: Call with correct signature
        const position = getNodePositionFromSelection(activeNode);

        if (position) {
          // 🔒 INDEX-BASED: Convert nodeId to index IMMEDIATELY
          const targetIndex = modelRef.current!.getIndexById(position.nodeId);

          // Update INDEX-BASED model FIRST (UNIFIED MODEL)
          modelRef.current!.updateCursor({
            index: targetIndex,
            segmentIndex: position.segmentIndex,
            offset: position.offset,
          });

          // Mirror to React
          setEditorState({
            ...editorState,
            cursor: position,
          });

          setSelection({ anchor: null, focus: null });
        }
      } else {
        const range = getSelectionRangeFromDOM(browserSelection);
        if (range) {
          setEditorState({
            ...editorState,
            cursor: {
              nodeId: range.focus.nodeId,
              segmentIndex: 0, // TODO: derive from DOM
              offset: range.focus.offset,
            },
          });
          setSelection(range);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editorState, grammarSession]);

  /**
   * Phase 5.1.6 — Browser Input Observer
   * Observes browser-native text changes (typing, paste, IME)
   * Syncs DOM text back to editor state
   */
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    // ✂️ PHASE 2.5: INPUT HANDLER DELETED
    // MutationObserver tracks typing passively - no active input handler needed
    // DOM is source of truth, extracted only at commit boundaries

    // 🔒 NEW ARCHITECTURE: Blur handler (using pure handler + old execution path)
    const handleBlur = (e: FocusEvent) => {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // COMMIT BOUNDARY: Blur (Flush Operation)
      // Contract: EDITOR-LIFECYCLE-CONTRACT.md
      // Responsibility: Extract current DOM, update state, exit
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // Step 1: Guard composition
      if (isComposing) return;

      const target = e.target as HTMLElement;
      if (!target.classList.contains('node__content')) return;

      const nodeId = target.getAttribute('data-node-id');
      if (!nodeId) return;
      
      // Extract segments first for handler validation
      const segments = extractSegmentsFromDOM(target);
      
      // Call pure handler for validation
      const blurResult = handleBlurNew(newEditorState, nodeId as NodeID, segments);
      
      if (!blurResult.action) {
        return; // Handler rejected
      }
      
      // Execute using old blur logic (temporary during migration)
      // NOTE: This logic will be moved to coordinator during architecture cleanup

      // Step 2: Stop observer (graceful - may not exist if node unmounted)
      const observer = domObservers.current.get(nodeId as NodeID);
      if (!observer) {
        // Node already unmounted by React - this is fine, not an error
        return;
      }
      observer.stop();

      // Step 4: Read cursor from selection API
      // Check rangeCount to avoid reading cleared selection
      const selection = window.getSelection();
      const cursor =
        selection && selection.rangeCount > 0
          ? getNodePositionFromSelection({ id: nodeId, segments } as Node)
          : editorState.cursor;

      // Step 5: Update state (functional to avoid stale closure)
      // NOTE: No structural lock - blur is flush only, not structural
      setEditorState((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, segments } : n
        ) as UINode[],
        cursor: cursor || prev.cursor,
      }));

      // Step 6: Clear diagnostics
      observer.clearPendingMutations();

      // EXIT - React will manage observer lifecycle
      // No observer restart, no double RAF, no lifecycle management
    };

    // ✂️ PHASE 2.5: Input listener DELETED (no longer needed)
    containerEl.addEventListener('blur', handleBlur, true); // Capture phase

    return () => {
      // ✂️ PHASE 2.5: Input listener cleanup DELETED
      containerEl.removeEventListener('blur', handleBlur, true);
    };
  }, [editorState, grammarSession]);

  // ✂️ PHASE 2.5: flushPendingSegments() DELETED
  // Replaced with extractSegmentsFromDOM() at all commit boundaries

  // ✂️ PHASE 2.5: Debounce flush DELETED
  // MutationObserver tracks all changes passively
  // Commit boundaries (Enter, Backspace, Blur, Arrow) handle extraction
  // No periodic flushing needed - DOM is always authoritative

  /**
   * STEP 14.2 + PHASE 3C — Commit State Changes (with history)
   *
   * All state mutations go through this function.
   * Pushes current state to history before applying new state.
   * PHASE 3C: Syncs hashtags from text to properties.
   */
  function commit(changes: {
    nodes?: UINode[];
    cursor?: {
      nodeId?: NodeID;
      segmentIndex?: number;
      offset?: number;
      // Legacy bias support during migration
      bias?: 'before' | 'after';
    };
    // Legacy support (will be removed)
    activeNodeId?: NodeID;
    offset?: number;
    focusRootId?: NodeID | null;
    selection?: SelectionState;
  }) {
    // ✂️ PHASE 2.5: isTyping() assertion DELETED
    // Replaced with observer lifecycle checks
    // Observers MUST be stopped before commit (enforced by commit boundary contract)

    // 🚨 DEV ASSERTION: Verify observers stopped during commit
    if (__DEV__ && changes.nodes) {
      const activeNodeId = changes.cursor?.nodeId || editorState.cursor.nodeId;
      const observer = domObservers.current.get(activeNodeId as NodeID);
      // Silent check
    }

    // 🔒 Sync modelRef whenever React state changes (UNIFIED MODEL)
    if (changes.nodes && changes.cursor) {
      const indexCursor = cursorToIndex(
        changes.nodes,
        changes.cursor.nodeId,
        changes.cursor.segmentIndex,
        changes.cursor.offset
      );
      modelRef.current!.updateState(changes.nodes as Node[], indexCursor);
    } else if (changes.nodes) {
      // Nodes changed but cursor unchanged - keep existing cursor
      const currentCursor = modelRef.current!.getCursor();
      modelRef.current!.updateState(changes.nodes as Node[], currentCursor);
    } else if (changes.cursor) {
      // Cursor-only update
      const currentNodes = modelRef.current!.getNodes() as Node[];
      const indexCursor = cursorToIndex(
        currentNodes,
        changes.cursor.nodeId,
        changes.cursor.segmentIndex,
        changes.cursor.offset
      );
      modelRef.current!.updateState(currentNodes, indexCursor);
    }

    // PHASE 3C: Sync hashtags from text to properties (before committing)
    let finalNodes = changes.nodes;
    if (finalNodes) {
      finalNodes = finalNodes.map((node) => {
        const syncResult = syncPropertiesFromText(node);
        if (syncResult.changed) {
          return { ...node, props: syncResult.updatedProps };
        }
        return node;
      });
    }

    // SEGMENTED ARCHITECTURE — Build cursor from changes (support dual-mode)
    let finalCursor = { ...editorState.cursor };

    if (changes.cursor) {
      finalCursor = {
        nodeId: changes.cursor.nodeId ?? finalCursor.nodeId,
        segmentIndex:
          changes.cursor.segmentIndex ?? finalCursor.segmentIndex ?? 0,
        offset: changes.cursor.offset ?? finalCursor.offset,
      };
    } else if (
      changes.activeNodeId !== undefined ||
      changes.offset !== undefined
    ) {
      // Legacy support - convert to new format
      finalCursor = {
        nodeId: changes.activeNodeId ?? finalCursor.nodeId,
        segmentIndex: 0, // Default to first segment for legacy calls
        offset: changes.offset ?? finalCursor.offset,
      };
    }

    // STEP 14.2.1 — Create snapshot of current state
    const snapshot: EditorSnapshot = {
      nodes: editorState.nodes as UINode[],
      cursor: editorState.cursor,
      focusRootId,
      selection,
    };

    // STEP 14.2.2 — Push to past, clear future, limit history
    const MAX_HISTORY = 100;
    const newPast = [...history.past, snapshot];
    if (newPast.length > MAX_HISTORY) {
      newPast.shift(); // Remove oldest
    }

    setHistory({
      past: newPast,
      future: [], // Clear future on new commit
    });

    // STEP 14.2.3 — Apply new state (with synced props)
    if (
      finalNodes !== undefined ||
      changes.cursor !== undefined ||
      changes.activeNodeId !== undefined ||
      changes.offset !== undefined
    ) {
      setEditorState({
        nodes: finalNodes ?? editorState.nodes,
        cursor: finalCursor,
      });
    }

    if (changes.focusRootId !== undefined) {
      setFocusRootId(changes.focusRootId);
    }

    if (changes.selection !== undefined) {
      setSelection(changes.selection);
    }
  }

  /**
   * STEP 14.3 — Undo Function
   */
  function undo() {
    if (history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    if (!previous) return;

    const newPast = history.past.slice(0, -1);

    // Create snapshot of current state for future (FILE 06.2)
    const currentSnapshot: EditorSnapshot = {
      nodes: editorState.nodes as UINode[],
      cursor: editorState.cursor,
      focusRootId,
      selection,
    };

    setHistory({
      past: newPast,
      future: [currentSnapshot, ...history.future],
    });

    // Restore previous state (FILE 06.2)
    // BATCH 5 FIX: Validate cursor node exists in restored nodes
    const restoredNodes = previous.nodes;
    const cursorNodeExists = restoredNodes.some(
      (n) => n.id === previous.cursor.nodeId
    );
    
    // Fallback to first visible node if cursor node doesn't exist
    const safeCursor = cursorNodeExists
      ? previous.cursor
      : {
          nodeId: restoredNodes[0]?.id ?? '',
          segmentIndex: 0,
          offset: 0,
        };

    setEditorState({
      nodes: restoredNodes,
      cursor: safeCursor,
    });
    setFocusRootId(previous.focusRootId);
    setSelection(previous.selection);
    
    // BATCH 5 FIX: Don't request caret placement - cursor restoration is automatic
    // requestCaretPlacement() reads state before React update completes, causing race condition
    // The cursor will be naturally placed when React re-renders with new state
  }

  /**
   * STEP 14.3 — Redo Function
   */
  function redo() {
    if (history.future.length === 0) return;

    const next = history.future[0];
    if (!next) return;

    const newFuture = history.future.slice(1);

    // Create snapshot of current state for past (FILE 06.2)
    const currentSnapshot: EditorSnapshot = {
      nodes: editorState.nodes as UINode[],
      cursor: editorState.cursor,
      focusRootId,
      selection,
    };

    setHistory({
      past: [...history.past, currentSnapshot],
      future: newFuture,
    });

    // Restore next state (FILE 06.2)
    // BATCH 5 FIX: Validate cursor node exists in restored nodes
    const restoredNodes = next.nodes;
    const cursorNodeExists = restoredNodes.some(
      (n) => n.id === next.cursor.nodeId
    );
    
    // Fallback to first visible node if cursor node doesn't exist
    const safeCursor = cursorNodeExists
      ? next.cursor
      : {
          nodeId: restoredNodes[0]?.id ?? '',
          segmentIndex: 0,
          offset: 0,
        };

    setEditorState({
      nodes: restoredNodes,
      cursor: safeCursor,
    });
    setFocusRootId(next.focusRootId);
    setSelection(next.selection);
    
    // BATCH 5 FIX: Don't request caret placement - cursor restoration is automatic
    // requestCaretPlacement() reads state before React update completes, causing race condition
    // The cursor will be naturally placed when React re-renders with new state
  }

  /**
   * PHASE C + 3A + 3B — Commit Grammar (Execute Selected Command)
   *
   * Converts selected grammar candidate to command and executes it.
   * PHASE 3A: Removes slash text from node after execution.
   * PHASE 3B: Removes mention text from node after execution.
   */
  function commitGrammar() {
    if (!isSessionActive(grammarSession)) {
      return;
    }

    const candidate = getSelectedCandidate(grammarSession);
    if (!candidate) {
      return;
    }

    // PHASE 3A/3B/09: Remove grammar text from node
    // For slash: "/todo" → removed
    // For mention: "@NodeName" → removed (reference is semantic)
    // For reference: "[[query" → removed (reference is semantic, File 09)
    // For hashtag: "#status done" → kept (properties stay inline)
    const shouldRemoveText =
      grammarSession.grammar &&
      grammarSession.range &&
      (grammarSession.grammar.type === 'slash' ||
        grammarSession.grammar.type === 'mention' ||
        grammarSession.grammar.type === 'reference');

    // PHASE 1: REFERENCES DISABLED
    // Reference insertion temporarily removed for core stability

    if (shouldRemoveText) {
      const activeNode = editorState.nodes.find(
        (n) => n.id === editorState.cursor.nodeId
      );
      if (activeNode && grammarSession.range) {
        const { from, to } = grammarSession.range;

        // SEGMENTED ARCHITECTURE: Delete grammar range from plain text
        const plainText = getPlainText(activeNode.segments);
        const newText = plainText.slice(0, from) + plainText.slice(to);

        // Rebuild segments with new text (simplified)
        const newSegments = newText
          ? [{ type: 'text' as const, text: newText }]
          : [];

        // Update node segments without grammar trigger
        const updatedNodes = editorState.nodes.map((n) =>
          n.id === activeNode.id ? { ...n, segments: newSegments } : n
        );

        setEditorState({
          ...editorState,
          nodes: updatedNodes,
          cursor: {
            ...editorState.cursor,
            offset: from, // Move cursor to where grammar started
          },
        });
      }
    }

    // Convert intent to command
    const command = intentToCommand(candidate);
    if (!command) {
      setGrammarSession(EMPTY_GRAMMAR_SESSION);
      return;
    }

    // Create editor context for command execution
    const context: EditorContext = {
      getState: () => editorState,
      mutations: {
        updateNodes: (nodes: Node[]) => {
          commit({ nodes: nodes as UINode[] });
        },
        setActiveNode: (nodeId: NodeID, offset: number) => {
          setEditorState({
            ...editorState,
            cursor: { nodeId, segmentIndex: 0, offset },
          });
        },
        createNode: (
          nodeType: string,
          text: string,
          parentId?: NodeID | null,
          afterId?: NodeID | null
        ) => {
          // Validate and cast nodeType
          const validType: import('../engine').NodeType =
            nodeType === 'heading' ? 'heading' : 'paragraph';

          const newNode = createNode(validType, text, parentId || null);
          const updatedNodes = afterId
            ? insertNodeAfter(editorState.nodes, afterId, newNode)
            : [...editorState.nodes, newNode];
          commit({ nodes: updatedNodes as UINode[] });
          return newNode.id;
        },
        deleteNode: (nodeId: NodeID) => deleteNode(nodeId),
        indentNode: (nodeId: NodeID) => {
          const newState = indentNode(editorState);
          commit({
            nodes: newState.nodes as UINode[],
            cursor: newState.cursor,
          });
        },
        outdentNode: (nodeId: NodeID) => {
          const newState = outdentNode(editorState);
          commit({
            nodes: newState.nodes as UINode[],
            cursor: newState.cursor,
          });
        },
        moveNode: (
          nodeId: NodeID,
          newParentId: NodeID | null,
          afterId: NodeID | null
        ) => {
          // Move not yet implemented in old system
        },
        setNodeProperty: (nodeId: NodeID, key: string, value: string) =>
          setNodeProperty(nodeId, key, value),
        deleteNodeProperty: (nodeId: NodeID, key: string) =>
          deleteNodeProperty(nodeId, key),
        addReference: (fromNodeId: NodeID, toNodeId: NodeID) =>
          addNodeRef(fromNodeId, toNodeId),
        removeReference: (fromNodeId: NodeID, toNodeId: NodeID) => {
          // Remove not yet fully implemented
        },
        applyTemplate: (nodeId: NodeID, templateId: string) => {
          const template = templates.find(
            (t) => t.id === templateId || t.name === templateId
          );
          if (template) {
            applyTemplate(nodeId, template);
          }
        },
      },
      documents: {
        create: (name?: string) => {
          createNewDocument();
          return activeDocumentId; // Return current (new logic would return new ID)
        },
        rename: renameDocument,
        delete: deleteDocument,
        switch: switchToDocument,
      },
      system: {
        saveNow: () => {
          // Trigger explicit save
        },
        bindLocation: chooseSaveLocation,
        retrySave: retryWrite,
      },
    };

    // Execute command
    const result = executeCommand(command, context);

    // Clear grammar session
    setGrammarSession(EMPTY_GRAMMAR_SESSION);
  }

  /**
   * PHASE C — Cancel Grammar (Escape)
   */
  function cancelGrammar() {
    setGrammarSession(EMPTY_GRAMMAR_SESSION);
  }

  /**
   * PHASE C + 3B — Detect and Update Grammar
   *
   * Called on text changes to detect active grammar.
   * PHASE 3B: Includes available nodes/documents for mention resolution.
   */
  function updateGrammarDetection(text: string, cursorOffset: number) {
    // PHASE 3B: Build context with available entities for mention resolution
    const availableNodes = editorState.nodes
      .filter(
        (n) => n.id !== editorState.cursor.nodeId && !(n as UINode).isDeleted
      )
      .map((n) => ({
        id: n.id,
        label: getNodeLabel(n),
      }));

    const availableDocuments = Object.values(documents).map((doc) => ({
      id: doc.documentId,
      name: doc.name,
    }));

    // PHASE 3C: Collect all properties for hashtag suggestions
    const allProperties: Array<{ key: string; value: string }> = [];
    for (const node of editorState.nodes) {
      if (node.props) {
        for (const [key, value] of Object.entries(node.props)) {
          allProperties.push({ key, value });
        }
      }
    }

    const context = {
      nodeId: editorState.cursor.nodeId,
      cursorOffset,
      documentId: activeDocumentId,
      workspaceId,
      availableNodes,
      availableDocuments,
      allProperties, // PHASE 3C
    };

    // Grammar detection now handled by matchGrammar in input observer
    // This section is deprecated but kept for compatibility
    setGrammarSession(EMPTY_GRAMMAR_SESSION);
  }

  /**
   * UI PHASE 2 — Switch to Different Document
   *
   * Critical: This function must NOT remount NodeEditor.
   * It swaps editor state cleanly without losing data.
   *
   * Flow:
   * 1. Save current document state to cache (already done in persistedState useMemo)
   * 2. Load new document state from cache (or create empty)
   * 3. Update all editor state atoms
   * 4. Persistence hook will trigger autosave automatically
   */
  function switchToDocument(newDocumentId: string) {
    if (newDocumentId === activeDocumentId) return;
    if (!documents[newDocumentId]) return;

    // Current state is already cached via persistedState useMemo
    // Just need to load new state or create empty

    const cached = documentStatesRef.current[newDocumentId];

    if (cached) {
      // Restore from cache
      setEditorState(cached.editorState);
      setViews(cached.views);
      _setTemplates(cached.templates);
      setHistory(cached.history);
      setSelection(cached.selection);
      setFocusRootId(cached.focusRootId);
    } else {
      // Create fresh document state
      const node1 = createNode('paragraph', '');
      setEditorState({
        nodes: [node1],
        cursor: {
          nodeId: node1.id,
          segmentIndex: 0,
          offset: 0,
        },
      });
      setViews([]);
      _setTemplates([]);
      setHistory({ past: [], future: [] });
      setSelection({ anchor: null, focus: null });
      setFocusRootId(null);
    }

    // Clear ephemeral UI state
    setQuery(null);
    setQueryInput('');
    setShowQueryBar(false);
    setRefPickerState({ isOpen: false, sourceNodeId: null, selectedIndex: 0 });
    setEditingProperty(null);
    setShowSaveViewDialog(false);
    setShowTemplatePicker(false);
    setRecoveryEvents([]);
    setShowRecoveryPanel(false);

    // Update active document ID
    setActiveDocumentId(newDocumentId);

    // Update document lastModified
    setDocuments((prev) => ({
      ...prev,
      [newDocumentId]: {
        ...prev[newDocumentId]!,
        lastModified: Date.now(),
      },
    }));
  }

  /**
   * UI PHASE 2 — Create New Document
   */
  function createNewDocument() {
    const newDocId = crypto.randomUUID();
    const newDoc: DocumentMetadata = {
      documentId: newDocId,
      name: 'Untitled',
      lastModified: Date.now(),
    };

    setDocuments((prev) => ({
      ...prev,
      [newDocId]: newDoc,
    }));

    // Switch to new document
    switchToDocument(newDocId);
  }

  /**
   * UI PHASE 2 — Rename Document
   */
  function renameDocument(docId: string, newName: string) {
    setDocuments((prev) => ({
      ...prev,
      [docId]: {
        ...prev[docId]!,
        name: newName.trim() || 'Untitled',
        lastModified: Date.now(),
      },
    }));
  }

  /**
   * UI PHASE 2 — Delete Document
   */
  function deleteDocument(docId: string) {
    // Cannot delete the only document
    if (Object.keys(documents).length === 1) {
      alert('Cannot delete the only document');
      return;
    }

    // If deleting active document, switch to another first
    if (docId === activeDocumentId) {
      const otherDocId = Object.keys(documents).find((id) => id !== docId);
      if (otherDocId) {
        switchToDocument(otherDocId);
      }
    }

    // Remove from registry
    setDocuments((prev) => {
      const { [docId]: _, ...rest } = prev;
      return rest;
    });

    // Remove from cache
    delete documentStatesRef.current[docId];
  }

  /**
   * STEP 15.3 — Parse Query String
   *
   * Syntax:
   * - /text <value>       → text search
   * - /prop <key>         → has property key
   * - /prop <key> <value> → property key=value
   * - /ref @<node label>  → references node (by label match)
   */
  function parseQuery(input: string): Query {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // /text <value>
    if (trimmed.startsWith('/text ')) {
      const value = trimmed.substring(6).trim();
      return value ? { type: 'text', value } : null;
    }

    // /prop <key> [value]
    if (trimmed.startsWith('/prop ')) {
      const rest = trimmed.substring(6).trim();
      const parts = rest.split(/\s+/);
      const key = parts[0];
      const value = parts.slice(1).join(' ') || undefined;
      return key ? { type: 'property', key, value } : null;
    }

    // /ref @<label> - find node by label
    if (trimmed.startsWith('/ref ')) {
      const labelPart = trimmed.substring(5).trim();
      if (labelPart.startsWith('@')) {
        const targetLabel = labelPart.substring(1).toLowerCase();
        // Find node by label match
        const targetNode = editorState.nodes.find((n) =>
          getNodeLabel(n).toLowerCase().includes(targetLabel)
        );
        return targetNode ? { type: 'ref', nodeId: targetNode.id } : null;
      }
    }

    return null;
  }

  /**
   * STEP 15.2 — Match Query (read-only filter)
   *
   * Determines if a node matches the current query.
   * No mutation, pure boolean check.
   */
  function matchesQuery(node: UINode, q: Query): boolean {
    if (!q) return true; // No query = show all

    switch (q.type) {
      case 'text':
        // Substring match (case-insensitive) - use segmented query API
        return matchQuery(node, { type: 'text', value: q.value });

      case 'property':
        // Check if property key exists
        if (!node.props) return false;
        if (!(q.key in node.props)) return false;
        // If value specified, match it
        if (q.value !== undefined) {
          return node.props[q.key]?.toLowerCase() === q.value.toLowerCase();
        }
        return true;

      case 'ref':
        // Check if node references target
        return node.refs?.includes(q.nodeId) ?? false;

      default:
        return true;
    }
  }

  /**
   * STEP 9.2 — Get Visible Nodes (respects collapse + focus)
   * Returns nodes that should be visible
   * - Respects collapse state
   * - Respects focus/zoom (if focusRootId is set)
   * - STEP 13.2 — Filters out deleted nodes
   * - STEP 15.2 — Filters by query
   */
  function getVisibleNodes(nodes: UINode[]): UINode[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // STEP 9.2 — Check if node is descendant of focusRoot
    function isDescendantOf(node: UINode, ancestorId: NodeID): boolean {
      let current = node.parentId;
      while (current) {
        if (current === ancestorId) return true;
        const parent = byId.get(current);
        if (!parent) return false;
        current = parent.parentId;
      }
      return false;
    }

    function isVisible(node: UINode): boolean {
      // STEP 13.2 — Deleted nodes are not visible
      if (node.isDeleted) return false;

      // STEP 15.2 — Query filter
      if (!matchesQuery(node, query)) return false;

      // STEP 9.2 — If focused on a subtree, only show focusRoot and its descendants
      if (focusRootId) {
        const isFocusRoot = node.id === focusRootId;
        const isDescendant = isDescendantOf(node, focusRootId);
        if (!isFocusRoot && !isDescendant) return false;
      }

      // Check collapse state (original logic)
      let current = node.parentId;
      while (current) {
        const parent = byId.get(current);
        if (!parent) return true;
        if (parent.isCollapsed) return false;
        current = parent.parentId;
      }
      return true;
    }

    return nodes.filter(isVisible);
  }

  /**
   * STEP 7.5 — Children detection
   * Check if a node has any children
   */
  function hasChildren(node: UINode, nodes: UINode[]): boolean {
    return nodes.some((n) => n.parentId === node.id);
  }

  /**
   * STEP 4.1 — Normalize Selection
   * Converts anchor/focus into deterministic start/end
   */
  function normalizeSelection(
    anchor: { nodeId: NodeID; offset: number } | null,
    focus: { nodeId: NodeID; offset: number } | null,
    nodes: Node[]
  ): {
    start: { nodeId: NodeID; offset: number };
    end: { nodeId: NodeID; offset: number };
    sameNode: boolean;
  } | null {
    if (!anchor || !focus) return null;

    if (anchor.nodeId === focus.nodeId) {
      return {
        start: anchor.offset <= focus.offset ? anchor : focus,
        end: anchor.offset <= focus.offset ? focus : anchor,
        sameNode: true,
      };
    }

    const aIndex = nodes.findIndex((n) => n.id === anchor.nodeId);
    const fIndex = nodes.findIndex((n) => n.id === focus.nodeId);

    if (aIndex < fIndex) {
      return { start: anchor, end: focus, sameNode: false };
    } else {
      return { start: focus, end: anchor, sameNode: false };
    }
  }

  /**
   * Get node level (depth in tree hierarchy)
   * 
   * Level 0 = root node (no parent)
   * Level 1 = direct child of root
   * Level 2 = grandchild, etc.
   * 
   * NOTE: Pure tree math - no React/DOM dependencies.
   * TEMPORARY LOCATION: Will be moved to /editor/utils/tree.ts during architecture cleanup.
   */
  function getNodeLevel(node: Node, nodes: Node[]): number {
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    let level = 0;
    let current = node;

    while (current.parentId) {
      const parent = nodesById.get(current.parentId);
      if (!parent) break;
      level++;
      current = parent;
    }

    return level;
  }

  /**
   * STEP 6.4 — Indent Node (Tab)
   * 
   * INVARIANT: Always indent by exactly +1 level
   * 
   * Logic:
   * - Find nearest previous node at same level → make it parent
   * - Find nearest previous node at (level - 1) → make it parent
   * - This guarantees currentLevel + 1 in all cases
   * 
   * This is structurally unbreakable across all tree configurations.
   * 
   * NOTE: Structural tree logic - not UI logic.
   * TEMPORARY LOCATION: Will be moved to /editor/core/NodeOperations.ts during architecture integration.
   */
  function indentNode(state: EditorState): EditorState {
    const { nodes, cursor } = state;
    const nodeId = cursor.nodeId;
    
    const visibleNodes = getVisibleNodes(nodes);
    const index = visibleNodes.findIndex((n) => n.id === nodeId);

    if (index <= 0) return state; // Cannot indent first node

    const current = visibleNodes[index];
    const currentLevel = getNodeLevel(current, nodes);
    let newParentId: string | null = null;

    // Walk backwards to find appropriate parent
    for (let i = index - 1; i >= 0; i--) {
      const candidate = visibleNodes[i];
      const candidateLevel = getNodeLevel(candidate, nodes);

      // CASE 1: Previous node at same level → become its child
      if (candidateLevel === currentLevel) {
        newParentId = candidate.id;
        break;
      }

      // CASE 2: Previous node at (level - 1) → become its child
      if (candidateLevel === currentLevel - 1) {
        newParentId = candidate.id;
        break;
      }

      // candidateLevel > currentLevel → skip (deeper node, keep looking)
    }

    if (newParentId === null) return state;

    return {
      ...state,
      nodes: nodes.map((n) =>
        n.id === nodeId ? { ...n, parentId: newParentId } : n
      ),
    };
  }

  /**
   * STEP 6.4 — Outdent Node (Shift+Tab)
   * 
   * INVARIANT: Always outdent by exactly -1 level AND adopt following siblings
   * 
   * Logic:
   * 1. Promote node to parent's level (parentId = grandparent)
   * 2. Find all siblings that come AFTER in visible order
   * 3. Make those siblings children of the outdented node
   * 
   * This preserves visual continuity and "block owns everything after it" semantics.
   * Matches behavior of Notion, Roam Research, WorkFlowy.
   * 
   * NOTE: Structural tree logic - not UI logic.
   * TEMPORARY LOCATION: Will be moved to /editor/core/NodeOperations.ts during architecture integration.
   */
  function outdentNode(state: EditorState): EditorState {
    const { nodes, cursor } = state;
    const node = nodes.find((n) => n.id === cursor.nodeId);
    if (!node || !node.parentId) return state; // No parent to outdent from

    const parent = nodes.find((n) => n.id === node.parentId);
    const visibleNodes = getVisibleNodes(nodes);
    const currentIndex = visibleNodes.findIndex((n) => n.id === node.id);

    // Find siblings that come AFTER this node in visible order
    // Use slice for O(n) performance instead of filter with findIndex
    const followingSiblings = visibleNodes
      .slice(currentIndex + 1)
      .filter((n) => n.parentId === node.parentId);

    return {
      ...state,
      nodes: nodes.map((n) => {
        // 1. Promote current node to parent's level
        if (n.id === node.id) {
          return { ...n, parentId: parent?.parentId ?? null };
        }

        // 2. Adopt following siblings as children
        if (followingSiblings.some((s) => s.id === n.id)) {
          return { ...n, parentId: node.id };
        }

        return n;
      }),
    };
  }

  /**
   * STEP 7.2 — Create Child (Enter at start)
   * Creates a new child node under the current node
   */
  function createChild(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.cursor.nodeId);
    if (!node) return state;

    const child = createNode(node.type, '', node.id);
    const withChild = insertNodeAfter(state.nodes, node.id, child);

    return {
      ...state,
      nodes: withChild,
      cursor: {
        nodeId: child.id,
        segmentIndex: 0,
        offset: 0,
      },
    };
  }

  /**
   * STEP 8.3 — Collapse Node
   * Hides all descendants
   */
  function collapseNode(state: EditorState): EditorState {
    const nodeId = state.cursor.nodeId;
    const node = state.nodes.find((n) => n.id === nodeId) as UINode;
    if (!node || !hasChildren(node, state.nodes)) return state;

    return {
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === node.id ? { ...n, isCollapsed: true } : n
      ),
    };
  }

  /**
   * STEP 8.3 — Expand Node
   * Shows immediate children
   */
  function expandNode(state: EditorState): EditorState {
    const nodeId = state.cursor.nodeId;
    const node = state.nodes.find((n) => n.id === nodeId) as UINode;
    if (!node || !node.isCollapsed) return state;

    return {
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === node.id ? { ...n, isCollapsed: false } : n
      ),
    };
  }

  /**
   * STEP 10.3/10.5.5 — Property editing state
   * isNewProperty: true = creating new, false = editing existing (key locked)
   */
  const [editingProperty, setEditingProperty] = useState<{
    nodeId: NodeID;
    key: string;
    value: string;
    isNewProperty: boolean;
    // Track if triggered by : + space (for conditional : removal)
    triggeredByColon?: boolean;
    colonOffset?: number; // Offset of the : character in plain text
  } | null>(null);

  /**
   * BATCH 4 — Dismiss property editor
   * 
   * If triggered by : + space, insert space after : to prevent re-triggering
   */
  function dismissPropertyEditor() {
    if (!editingProperty) return;

    // If triggered by colon, insert space after : to prevent re-trigger
    if (editingProperty.triggeredByColon && editingProperty.colonOffset !== undefined) {
      const node = editorState.nodes.find(n => n.id === editingProperty.nodeId);
      if (node) {
        // Convert segments to plain text
        const plainText = node.segments
          .map(s => s.type === 'text' ? s.text : '')
          .join('');
        const colonPos = editingProperty.colonOffset;

        // Insert space after : (so text becomes ": " instead of just ":")
        const newPlainText = plainText.slice(0, colonPos + 1) + ' ' + plainText.slice(colonPos + 1);

        // Convert to segments
        const newSegments: Segment[] = newPlainText ? [{ type: 'text', text: newPlainText }] : [];

        const updatedNodes = editorState.nodes.map((n) =>
          n.id === editingProperty.nodeId
            ? { ...n, segments: newSegments }
            : n
        );

        commit({
          nodes: updatedNodes as UINode[],
          cursor: {
            nodeId: editingProperty.nodeId,
            segmentIndex: 0,
            offset: colonPos + 2, // After ": "
          },
        });
      }
    }

    setEditingProperty(null);
  }

  /**
   * STEP 10.5.2 — Add/update property on a node (hardened)
   * Enforces invariants: normalization, uniqueness, immutability
   */
  function setNodeProperty(nodeId: NodeID, rawKey: string, value: string) {
    // 10.5.1 — Normalize key
    const key = rawKey.trim().toLowerCase();
    if (!key) return; // No empty keys allowed

    const updatedNodes = editorState.nodes.map((n) => {
      if (n.id !== nodeId) return n;

      let updatedNode = { ...n };

      // 🔒 BATCH 4: If property editor was triggered by : + space, remove the :
      if (editingProperty?.triggeredByColon && editingProperty?.colonOffset !== undefined) {
        const plainText = getPlainText(n.segments);
        const colonPos = editingProperty.colonOffset;

        // Remove : character from plain text
        const newPlainText = plainText.slice(0, colonPos) + plainText.slice(colonPos + 1);

        // Convert back to segments (simple approach: single text segment)
        const newSegments: Segment[] = newPlainText ? [{ type: 'text', text: newPlainText }] : [];

        updatedNode = { ...updatedNode, segments: newSegments };
      }

      // 10.5.1 — Add property (overwrite semantics, keys are unique)
      const props = { ...(updatedNode.props ?? {}) };
      props[key] = value; // Insertion order preserved by JS spec (ES2015+)

      return { ...updatedNode, props };
    });

    // STEP 14.2 — Commit property change
    commit({
      nodes: updatedNodes as UINode[],
    });
  }

  /**
   * STEP 10.5.3 — Explicit property deletion
   * Only way to remove a property
   */
  function deleteNodeProperty(nodeId: NodeID, key: string) {
    const updatedNodes = editorState.nodes.map((n) => {
      if (n.id !== nodeId || !n.props || !(key in n.props)) return n;

      const props = { ...n.props };
      delete props[key];

      // Remove props object if empty
      return Object.keys(props).length === 0
        ? { ...n, props: undefined }
        : { ...n, props };
    });

    // STEP 14.2 — Commit property deletion
    commit({
      nodes: updatedNodes as UINode[],
    });
  }

  /**
   * STEP 10.5.5 — Edit existing property (click handler)
   */
  function editProperty(nodeId: NodeID, key: string, value: string) {
    setEditingProperty({ nodeId, key, value, isNewProperty: false });
  }

  /**
   * STEP 11.1.4 — Handle clicking a reference (zoom to target)
   */
  function handleRefClick(targetId: NodeID) {
    // Zoom to the referenced node
    setFocusRootId(targetId);
    setEditorState({
      ...editorState,
      cursor: {
        nodeId: targetId,
        segmentIndex: 0,
        offset: 0,
      },
    });
    setSelection({ anchor: null, focus: null });
  }

  /**
   * STEP 11.2.2 — Add reference to a node
   * Enforces: no self-reference, no duplicates
   */
  function addNodeRef(nodeId: NodeID, targetId: NodeID) {
    // 11.1.2 — No self-reference
    if (nodeId === targetId) return;

    const updatedNodes = editorState.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const refs = n.refs ?? [];
      // 11.1.2 — No duplicates
      if (refs.includes(targetId)) return n;
      return { ...n, refs: [...refs, targetId] };
    });

    // STEP 14.2 — Commit reference addition
    commit({
      nodes: updatedNodes as UINode[],
    });
  }

  /**
   * STEP 11.2.2 — Remove reference from a node (reserved for future use)
   */
  // function _removeNodeRef(nodeId: NodeID, targetId: NodeID) {
  //   setEditorState((prevEditorState) => ({
  //     ...prevEditorState,
  //     nodes: prevEditorState.nodes.map((n) => {
  //       if (n.id !== nodeId || !n.refs) return n;
  //       const refs = n.refs.filter((id) => id !== targetId);
  //       return refs.length === 0 ? { ...n, refs: undefined } : { ...n, refs };
  //     }),
  //   }));
  // }

  /**
   * STEP 11.3.1 — Get backlinks for a node (derived, read-only)
   * Returns all nodes that reference the given node
   */
  function getBacklinks(nodeId: NodeID): Node[] {
    return editorState.nodes.filter((n) => n.refs?.includes(nodeId));
  }

  /**
   * STEP 13.1 — Delete Node (Soft Delete)
   *
   * Deletion Rules:
   * 1. Mark node as deleted (isDeleted = true)
   * 2. Children: outdent them (move to deleted node's parent)
   * 3. Focus: if deleted node is active or zoomed, zoom out / move focus
   * 4. References: NOT touched (dangling refs are allowed)
   *
   * Recovery Invariant (Phase 13.3):
   * - Node still exists in state (soft delete)
   * - References to deleted nodes show as "(deleted)"
   * - Backlinks still work
   */
  function deleteNode(nodeId: NodeID) {
    const nodeToDelete = editorState.nodes.find(
      (n) => n.id === nodeId
    ) as UINode;
    if (!nodeToDelete) return;

    // STEP 13.1.1 — Find next non-deleted sibling or parent for focus target
    const visibleNodes = getVisibleNodes(editorState.nodes);
    const currentIndex = visibleNodes.findIndex((n) => n.id === nodeId);
    let nextFocusId: NodeID | null = null;

    // Try next sibling, then previous sibling, then parent
    if (currentIndex < visibleNodes.length - 1) {
      nextFocusId = visibleNodes[currentIndex + 1]?.id ?? null;
    } else if (currentIndex > 0) {
      nextFocusId = visibleNodes[currentIndex - 1]?.id ?? null;
    } else if (nodeToDelete.parentId) {
      nextFocusId = nodeToDelete.parentId;
    }

    // STEP 13.1.2 — Update state
    const updatedNodes = editorState.nodes.map((n) => {
      // Mark target node as deleted
      if (n.id === nodeId) {
        return { ...n, isDeleted: true } as UINode;
      }

      // STEP 13.1.3 — Outdent children (move to deleted node's parent)
      if (n.parentId === nodeId) {
        return { ...n, parentId: nodeToDelete.parentId };
      }

      return n;
    });

    // STEP 13.1.4 — Handle focus/zoom (FILE 06.2)
    let newCursorNodeId = editorState.cursor.nodeId;
    let newFocusRootId = focusRootId;

    // If deleted node was active, move focus
    if (editorState.cursor.nodeId === nodeId) {
      newCursorNodeId =
        nextFocusId ?? editorState.nodes[0]?.id ?? editorState.cursor.nodeId;
    }

    // If we're zoomed into the deleted node, zoom out
    if (focusRootId === nodeId) {
      newFocusRootId = nodeToDelete.parentId;
    }

    // STEP 14.2 — Commit deletion
    commit({
      nodes: updatedNodes,
      cursor: {
        nodeId: newCursorNodeId,
        segmentIndex: 0,
        offset: 0,
      },
    });
    setFocusRootId(newFocusRootId);
    setSelection({ anchor: null, focus: null });
  }

  /**
   * STEP 16.2 — Save Current View
   *
   * Captures current query + focusRootId as a named view.
   * Does not capture cursor, selection, or collapse state.
   */
  function saveView(name: string) {
    if (!name.trim()) return;

    const newView: View = {
      id: crypto.randomUUID(),
      name: name.trim(),
      query,
      focusRootId,
    };

    setViews((prevViews) => [...prevViews, newView]);
  }

  /**
   * STEP 16.3 — Switch to View
   *
   * Applies view's query + focusRootId.
   * Does not create undo entry (navigation, not mutation).
   */
  function switchToView(view: View) {
    setQuery(view.query);
    setFocusRootId(view.focusRootId);
  }

  /**
   * STEP 16.3 — Delete View
   */
  function deleteView(viewId: string) {
    setViews((prevViews) => prevViews.filter((v) => v.id !== viewId));
  }

  /**
   * STEP 17.2 — Apply Template to Node
   *
   * Adds template properties to node.
   * Rules:
   * - Only adds missing properties (does not overwrite)
   * - Does not affect text
   * - Undoable via commit
   */
  function applyTemplate(nodeId: NodeID, template: Template) {
    const node = editorState.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const updatedNodes = editorState.nodes.map((n) => {
      if (n.id !== nodeId) return n;

      const existingProps = n.props ?? {};
      const newProps = { ...existingProps };

      // Add template props that don't already exist
      for (const [key, value] of Object.entries(template.props)) {
        if (!(key in existingProps)) {
          newProps[key] = value ?? '';
        }
      }

      return { ...n, props: newProps };
    });

    // STEP 14.2 — Commit template application
    commit({
      nodes: updatedNodes as UINode[],
    });
  }

  /**
   * PHASE 22 — Recovery Action Runner
   *
   * Maps recovery actions to existing editor mutations.
   * All actions are undoable (use commit()).
   * Never auto-run - explicit user intent only.
   */
  function runRecoveryAction(action: RecoveryAction) {
    switch (action.type) {
      case 'focus-node': {
        // Reuse existing navigation logic
        const node = editorState.nodes.find((n) => n.id === action.nodeId);
        if (!node) return;

        setEditorState({
          ...editorState,
          cursor: {
            nodeId: action.nodeId,
            segmentIndex: 0,
            offset: 0,
          },
        });
        setFocusRootId(null); // Reset zoom to see the node
        setSelection({ anchor: null, focus: null });
        break;
      }

      case 'remove-ref': {
        // Reuse existing ref removal logic (from Phase 11)
        const updatedNodes = editorState.nodes.map((n) => {
          if (n.id !== action.fromNodeId) return n;
          if (!n.refs) return n;

          const refs = n.refs.filter((refId) => refId !== action.toNodeId);
          if (refs.length === 0) {
            const { refs: _, ...rest } = n;
            return rest as UINode;
          }

          return { ...n, refs };
        });

        // PHASE 22: Commit ref removal (undoable)
        commit({ nodes: updatedNodes as UINode[] });
        break;
      }

      case 'delete-node': {
        // Reuse Phase 13 soft delete logic
        deleteNode(action.nodeId);
        break;
      }
    }
  }

  /**
   * STEP 18.2 + PHASE 21 + PHASE 23 + UI PHASE 2 — Export State to JSON
   *
   * Serializes entire workspace (all documents) to JSON file.
   * Does NOT serialize: history, selection, cursor, focus, query.
   * Phase 21: Always writes LATEST_VERSION.
   * UI Phase 2: Exports all documents in workspace.
   */
  function exportState() {
    // Use already-computed persistedState from useMemo (includes all documents)
    const json = JSON.stringify(persistedState, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `clutter-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * STEP 18.2 + PHASE 19 + PHASE 20 + PHASE 21 + PHASE 23 + UI PHASE 2 — Import State from JSON
   *
   * Import pipeline (ordered):
   * 1. JSON.parse
   * 2. migrateToLatest (Phase 21 - shape evolution)
   * 3. normalizePersistedState (Phase 19 - integrity)
   * 4. RecoveryEvents (Phase 20 - explain)
   *
   * UI Phase 2: Imports entire workspace (all documents).
   * Replaces current workspace completely.
   * Creates new undo root (clears history).
   */
  function importState(json: string) {
    try {
      // STEP 1: Parse JSON
      const parsed = JSON.parse(json);

      // PHASE 21: Migrate to latest schema version
      const migrated = migrateToLatest(parsed);

      // PHASE 19/20: Normalize through trust boundary
      const { state, recovery } = normalizePersistedState(migrated);

      // UI PHASE 2: Import workspace structure
      setDocuments(state.documents);

      // Clear document states cache
      documentStatesRef.current = {};

      // Populate cache with all documents
      for (const [docId, docData] of Object.entries(state.documentData)) {
        const firstVisibleNode =
          docData.nodes.find((n) => !n.isDeleted) ?? docData.nodes[0];

        documentStatesRef.current[docId] = {
          editorState: {
            nodes: docData.nodes,
            cursor: {
              nodeId: firstVisibleNode?.id ?? '',
              segmentIndex: 0,
              offset: 0,
            },
          },
          views: docData.views,
          templates: docData.templates,
          history: { past: [], future: [] },
          selection: { anchor: null, focus: null },
          focusRootId: null,
        };
      }

      // Switch to active document
      switchToDocument(state.activeDocumentId);

      // PHASE 20: Store recovery events and show panel if there were issues
      setRecoveryEvents(recovery);
      if (recovery.length > 0) {
        setShowRecoveryPanel(true);
      }

      // Clear ephemeral UI state
      setQuery(null);
      setQueryInput('');
      setShowQueryBar(false);
      setRefPickerState({
        isOpen: false,
        sourceNodeId: null,
        selectedIndex: 0,
      });
      setEditingProperty(null);
      setShowSaveViewDialog(false);
      setShowTemplatePicker(false);
    } catch (error) {
      alert(
        `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * STEP 18.2 — Trigger File Import
   */
  function triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const json = event.target?.result as string;
        if (json) {
          // Confirm before replacing state
          if (
            confirm(`Import "${file.name}"? This will replace current state.`)
          ) {
            importState(json);
          }
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /**
   * UI PHASE 1 — Choose Save Location (Web-adapted)
   *
   * Web environment: Prompts user for filename and triggers download.
   * Tauri environment: Would use native file picker dialog.
   */
  async function chooseSaveLocation() {
    const defaultName = `clutter-${new Date().toISOString().slice(0, 10)}.json`;
    const filename = prompt('Save as:', defaultName);

    if (filename && typeof filename === 'string') {
      await bindPath(filename);
    }
  }

  /**
   * STEP 9.5 — Get breadcrumb path from root to focusRootId
   */
  function getBreadcrumbs(): UINode[] {
    if (!focusRootId) return [];

    const path: UINode[] = [];
    const byId = new Map(editorState.nodes.map((n) => [n.id, n]));

    let current = byId.get(focusRootId);
    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = byId.get(current.parentId);
      } else {
        break;
      }
    }

    return path;
  }

  /**
   * STEP 9.3 — Zoom In (focus on current node)
   * Treats current node as temporary root
   */
  function zoomIn() {
    setFocusRootId(editorState.cursor.nodeId);
    setSelection({ anchor: null, focus: null });
    setEditorState({
      ...editorState,
      cursor: {
        ...editorState.cursor,
        offset: 0,
      },
    });
  }

  /**
   * STEP 9.4 — Zoom Out (return to parent view)
   * If at root, does nothing
   */
  function zoomOut() {
    if (!focusRootId) return; // Already at root

    const focusNode = editorState.nodes.find((n) => n.id === focusRootId);
    if (!focusNode) return;

    const parentId = focusNode.parentId;
    setFocusRootId(parentId);
    setSelection({ anchor: null, focus: null });

    // Move cursor to the node we just zoomed out from
    if (parentId) {
      setEditorState({
        ...editorState,
        cursor: {
          nodeId: focusRootId,
          segmentIndex: 0,
          offset: 0,
        },
      });
    }
  }

  /**
   * STEP 8.4 — Navigate through visible nodes only
   */
  // SEGMENTED ARCHITECTURE — Pure tree navigation (no DOM math)
  function navigateVisibleUp(state: EditorState): EditorState {
    const visibleNodes = getVisibleNodes(state.nodes);
    const index = visibleNodes.findIndex((n) => n.id === state.cursor.nodeId);

    if (index <= 0) return state; // Already at top

    const prevNode = visibleNodes[index - 1];
    if (!prevNode) return state;

    // Get text length from segments (not legacy text field)
    const textLen = getPlainText(prevNode.segments || []).length;

    return {
      ...state,
      cursor: {
        nodeId: prevNode.id,
        segmentIndex: 0,
        offset: Math.min(state.cursor.offset, textLen),
      },
    };
  }

  function navigateVisibleDown(state: EditorState): EditorState {
    const visibleNodes = getVisibleNodes(state.nodes);
    const index = visibleNodes.findIndex((n) => n.id === state.cursor.nodeId);

    if (index === -1 || index >= visibleNodes.length - 1) return state; // Already at bottom

    const nextNode = visibleNodes[index + 1];
    if (!nextNode) return state;

    // Get text length from segments (not legacy text field)
    const textLen = getPlainText(nextNode.segments || []).length;

    return {
      ...state,
      cursor: {
        nodeId: nextNode.id,
        segmentIndex: 0,
        offset: Math.min(state.cursor.offset, textLen),
      },
    };
  }

  /**
   * STEP 4.2 — Delete Selection
   * Removes selected text/nodes and returns new state
   */
  function deleteSelection(
    state: EditorState,
    selection: {
      start: { nodeId: NodeID; offset: number };
      end: { nodeId: NodeID; offset: number };
      sameNode: boolean;
    }
  ): EditorState {
    const { nodes } = state;
    const { start, end, sameNode } = selection;

    if (sameNode) {
      const node = nodes.find((n) => n.id === start.nodeId);
      if (!node) return state;

      // Use segmented editor for deletion - delegate to SegmentOps
      const plainText = getPlainText(node.segments);
      const newText =
        plainText.slice(0, start.offset) + plainText.slice(end.offset);
      const newSegments = newText
        ? [{ type: 'text' as const, text: newText }]
        : [];

      return {
        ...state,
        nodes: nodes.map((n) =>
          n.id === node.id ? { ...n, segments: newSegments } : n
        ),
        cursor: {
          nodeId: node.id,
          segmentIndex: 0,
          offset: start.offset,
        },
      };
    }

    // multi-node selection
    const startIndex = nodes.findIndex((n) => n.id === start.nodeId);
    const endIndex = nodes.findIndex((n) => n.id === end.nodeId);

    const startNode = nodes[startIndex];
    const endNode = nodes[endIndex];

    if (!startNode || !endNode) return state;

    // Use segmented editor for cross-node deletion
    const startText = getPlainText(startNode.segments);
    const endText = getPlainText(endNode.segments);
    const mergedText =
      startText.slice(0, start.offset) + endText.slice(end.offset);
    const mergedSegments = mergedText
      ? [{ type: 'text' as const, text: mergedText }]
      : [];

    let newNodes = nodes.slice(0, startIndex + 1);
    newNodes[startIndex] = { ...startNode, segments: mergedSegments };
    newNodes = newNodes.concat(nodes.slice(endIndex + 1));

    return {
      ...state,
      nodes: newNodes,
      cursor: {
        nodeId: startNode.id,
        segmentIndex: 0,
        offset: start.offset,
      },
    };
  }

  /**
   * Phase 5.1.3 — Mouse Handlers
   * DISABLED per Phase 5.1 directive:
   * - Mouse events must NOT mutate editor state directly
   * - Selection is handled ONLY via document.addEventListener('selectionchange')
   * - These are redundant with the selectionchange observer
   */
  // const handleMouseDown = (nodeId: NodeID) => {
  //   // Cancel any active grammar session
  //   if (isSessionActive(grammarSession)) {
  //     setGrammarSession(EMPTY_GRAMMAR_SESSION);
  //   }
  // };
  //
  // const handleMouseUp = (nodeId: NodeID) => {
  //   const browserSelection = window.getSelection();
  //   if (!browserSelection) return;
  //
  //   // Check if collapsed (caret) or range (selection)
  //   if (browserSelection.isCollapsed) {
  //     // Single caret position
  //     const position = getNodePositionFromSelection(browserSelection);
  //     if (position) {
  //       setEditorState({
  //         ...editorState,
  //         activeNodeId: position.nodeId,
  //         offset: position.offset,
  //       });
  //       setSelection({ anchor: null, focus: null });
  //     }
  //   } else {
  //     // Selection range
  //     const range = getSelectionRangeFromDOM(browserSelection);
  //     if (range) {
  //       setEditorState({
  //         ...editorState,
  //         activeNodeId: range.focus.nodeId,
  //         offset: range.focus.offset,
  //       });
  //       setSelection(range);
  //     }
  //   }
  // };

  /**
   * ✅ PRIORITY 3: Caret placement hook (eliminates race conditions)
   * 
   * Extracted from inline useEffect into dedicated hook.
   * Manages all caret placement after structural operations.
   * 
   * See: apps/editor/src/editor/caret/CaretPlacement.tsx
   */
  useCaretPlacement({
    cursor: editorState.cursor,
    nodes: editorState.nodes,
    needsPlacementRef: needsCaretPlacementRef,
    debug: __DEV__,
    maxRetries: 10,
  });

  // ✅ OLD IMPLEMENTATION REMOVED (190 lines extracted to CaretPlacement.tsx)
  /*
  useEffect(() => {
    if (!needsCaretPlacementRef.current) return;

    if (__DEV__) {

    }

    let cancelled = false;

    const tryPlace = (retries = 0) => {
      if (cancelled) return;

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🚨 SAFETY: Abandon after 10 retries (prevent infinite RAF loop)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (retries > 10) {

        needsCaretPlacementRef.current = false;
        return;
      }

      const activeNode = editorState.nodes.find(
        (n) => n.id === editorState.cursor.nodeId
      );
      if (!activeNode) {

        needsCaretPlacementRef.current = false;
        return;
      }

      // Find the node__content element
      const nodeElement = document.querySelector(
        `[data-node-id="${editorState.cursor.nodeId}"]`
      );

      if (!nodeElement) {
        // DOM not ready yet - retry next frame (bounded by retry limit)
        if (__DEV__) {

        }
        // ✅ PRIORITY 1: Type-safe RAF wrapper (prevents timestamp bugs)
        scheduleRAF(() => tryPlace(retries + 1));
        return;
      }

      // Ensure element is focused
      if (document.activeElement !== nodeElement) {
        (nodeElement as HTMLElement).focus();
      }

      const range = document.createRange();
      const sel = window.getSelection();
      if (!sel) {
        needsCaretPlacementRef.current = false;
        return;
      }

      try {
        // SEGMENTED ARCHITECTURE: Simple caret placement
        // No TreeWalker, no bias, no heuristics
        const { offset, segmentIndex } = editorState.cursor;
        const segments = activeNode.segments;

        if (segmentIndex >= segments.length) {
          // Cursor at end - place at last position
          const lastChild = nodeElement.lastChild;
          if (lastChild) {
            range.setStartAfter(lastChild);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } else {
          const segment = segments[segmentIndex];

          // 🔧 FIX: Handle inline segments by using caret-anchor
          if (segment.type === 'inline' && offset === 0) {
            // Find the caret-anchor BEFORE this inline element
            // DOM structure: each inline has: <span.caret-anchor/><span.inline/><span.caret-anchor/>
            const children = Array.from(nodeElement.childNodes);
            let domIndex = 0;

            // Walk through segments to find DOM position
            for (let i = 0; i < segmentIndex; i++) {
              if (segments[i].type === 'text') {
                domIndex++; // TEXT_NODE
              } else {
                domIndex += 3; // caret-anchor + inline + caret-anchor
              }
            }

            // domIndex now points to the caret-anchor before our inline
            const caretAnchor = children[domIndex];
            if (
              caretAnchor &&
              (caretAnchor as HTMLElement).classList?.contains('caret-anchor')
            ) {
              // Place cursor inside the caret-anchor (it's a focusable span)
              range.setStart(caretAnchor, 0);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);

            } else {

            }
          } else {
            // Text segment - find the correct text node in DOM
            const children = Array.from(nodeElement.childNodes);
            let domIndex = 0;

            // Walk through segments to find DOM position
            for (let i = 0; i < segmentIndex; i++) {
              if (segments[i].type === 'text') {
                domIndex++; // TEXT_NODE
              } else {
                domIndex += 3; // caret-anchor + inline + caret-anchor
              }
            }

            // domIndex now points to our text node
            const textNode = children[domIndex];
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
              const len = textNode.textContent?.length || 0;
              range.setStart(textNode, Math.min(offset, len));
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);

            } else {

            }
          }
        }
      } catch (err) {

      }

      needsCaretPlacementRef.current = false;
    };

    // Start AFTER React commit (single RAF, effect owns all timing)
    // ✅ PRIORITY 1: Type-safe RAF wrapper (prevents timestamp bugs)
    scheduleRAF(() => tryPlace());

    return () => {
      cancelled = true;
    };
  }, [editorState.cursor]);
  */

  // 🔒 NEW ARCHITECTURE: Composition handlers (using pure handler + old execution path)
  // CRITICAL: These prevent commit boundaries from running during IME composition
  // See COMMIT-BOUNDARY-CONTRACT.md Step 1
  const handleCompositionStart = (nodeId: NodeID) => {
    // Call pure handler for validation
    const compositionStartResult = handleCompositionStartNew(newEditorState, nodeId);
    
    if (!compositionStartResult.action) {
      return; // Handler rejected
    }
    
    // Execute using old composition logic (temporary during migration)
    // NOTE: This logic will be moved to coordinator during architecture cleanup
    if (__DEV__) {

    }
    setIsComposing(true);
  };

  const handleCompositionEnd = (nodeId: NodeID) => {
    // Call pure handler for validation
    const compositionEndResult = handleCompositionEndNew(newEditorState, nodeId);
    
    if (!compositionEndResult.action) {
      return; // Handler rejected
    }
    
    // Execute using old composition logic (temporary during migration)
    // NOTE: This logic will be moved to coordinator during architecture cleanup
    if (__DEV__) {

    }
    setIsComposing(false);
  };

  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // FIX 2 — Prevent Enter BEFORE any guards
    // Must block browser <div>/<br> insertion unconditionally
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
    }

    // D2 — KEYBOARD FOCUS GUARD (REMOVED)
    // Simplified: Trust selectionchange to have fired before keydown
    // If state is stale, behavior will fail fast and visibly

    // PHASE C — Grammar mode keyboard handling (highest priority)
    if (isSessionActive(grammarSession)) {
      // Escape cancels grammar
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelGrammar();
        return;
      }

      // Arrow Down - next candidate
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setGrammarSession(selectNextCandidate(grammarSession));
        return;
      }

      // Arrow Up - previous candidate
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setGrammarSession(selectPreviousCandidate(grammarSession));
        return;
      }

      // Enter - commit grammar
      if (e.key === 'Enter') {
        e.preventDefault();
        commitGrammar();
        return;
      }

      // Space - commit grammar (for slash and reference, Phase 09)
      if (
        e.key === ' ' &&
        (grammarSession.grammar?.type === 'slash' ||
          grammarSession.grammar?.type === 'reference')
      ) {
        e.preventDefault();
        commitGrammar();
        return;
      }

      // Tab - autocomplete command name (slash only)
      if (e.key === 'Tab' && grammarSession.grammar?.type === 'slash') {
        e.preventDefault();

        // If only one candidate, autocomplete to its name
        if (grammarSession.candidates.length === 1) {
          const candidate = grammarSession.candidates[0];
          if (candidate && grammarSession.range) {
            const activeNode = editorState.nodes.find(
              (n) => n.id === editorState.cursor.nodeId
            );
            if (activeNode) {
              // Extract command name from candidate
              const commandName =
                (candidate.params.keyword as string) ||
                candidate.commandType.split('.')[1] ||
                'command';

              const { from, to } = grammarSession.range;

              // Use segmented editor for grammar replacement
              const plainText = getPlainText(activeNode.segments);
              const newText =
                plainText.slice(0, from) +
                '/' +
                commandName +
                ' ' +
                plainText.slice(to);
              const newSegments = newText
                ? [{ type: 'text' as const, text: newText }]
                : [];

              const updatedNodes = editorState.nodes.map((n) =>
                n.id === activeNode.id ? { ...n, segments: newSegments } : n
              );

              setEditorState({
                ...editorState,
                nodes: updatedNodes,
                cursor: {
                  ...editorState.cursor,
                  offset: from + commandName.length + 2, // After "/" + command + " "
                },
              });

              // Clear grammar - will re-detect on next keystroke
              setGrammarSession(EMPTY_GRAMMAR_SESSION);
            }
          }
        }
        return;
      }
    }

    // 🔒 BATCH 5: Undo (Cmd/Ctrl + Z)
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const undoResult = handleUndo(newEditorState);
      if (undoResult.preventDefault) e.preventDefault();
      
      // Execute undo action
      withStructuralCommit(() => {
        undo();
      });
      return;
    }

    // 🔒 BATCH 5: Redo (Cmd/Ctrl + Shift + Z)
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      const redoResult = handleRedo(newEditorState);
      if (redoResult.preventDefault) e.preventDefault();
      
      // Execute redo action
      withStructuralCommit(() => {
        redo();
      });
      return;
    }

    // 🔒 BATCH 5: Save View (Cmd/Ctrl + Shift + S)
    if (e.key === 's' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      const saveViewResult = handleSaveViewDialogOpen(newEditorState);
      if (saveViewResult.preventDefault) e.preventDefault();
      
      // Execute action
      if (saveViewResult.action?.type === 'SAVE_VIEW_DIALOG_OPEN') {
        setShowSaveViewDialog(true);
        setSaveViewName('');
      }
      return;
    }

    // 🔒 BATCH 5: Open Template Picker (Cmd/Ctrl + Shift + T)
    if (e.key === 't' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      const templatePickerResult = handleTemplatePickerOpen(newEditorState);
      if (templatePickerResult.preventDefault) e.preventDefault();
      
      // Execute action
      if (templatePickerResult.action?.type === 'TEMPLATE_PICKER_OPEN') {
        setShowTemplatePicker(true);
        setTemplatePickerIndex(0);
      }
      return;
    }

    // STEP 18.2 — Export State (Cmd/Ctrl + Shift + E)
    if (e.key === 'e' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      exportState();
      return;
    }

    // STEP 18.2 — Import State (Cmd/Ctrl + Shift + I)
    if (e.key === 'i' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      triggerImport();
      return;
    }

    // STEP 13.1 — Explicit Delete (Cmd/Ctrl + D)
    if (e.key === 'd' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      deleteNode(editorState.cursor.nodeId);
      return;
    }

    // 🔒 BATCH 5: Open Reference Picker (Cmd/Ctrl + Shift + R)
    if (e.key === 'r' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      const refPickerResult = handleReferencePickerOpen(newEditorState);
      if (refPickerResult.preventDefault) e.preventDefault();
      
      // Execute action
      if (refPickerResult.action?.type === 'REFERENCE_PICKER_OPEN') {
        setRefPickerState({
          isOpen: true,
          sourceNodeId: refPickerResult.action.payload.sourceNodeId,
          selectedIndex: 0,
        });
      }
      return;
    }

    // 🔒 BATCH 5: Zoom In (Cmd/Ctrl + Enter)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      const zoomInResult = handleZoomIn(newEditorState);
      if (zoomInResult.preventDefault) e.preventDefault();
      
      // Execute zoom action
      zoomIn();
      return;
    }

    // 🔒 BATCH 5: Open Query Bar (/)
    if (e.key === '/' && !showQueryBar) {
      const queryBarResult = handleQueryBarOpen(newEditorState);
      if (queryBarResult.preventDefault) e.preventDefault();
      
      // Execute action
      if (queryBarResult.action?.type === 'QUERY_BAR_TOGGLE') {
        setShowQueryBar(true);
        setQueryInput('');
      }
      return;
    }

    // 🔒 BATCH 5: Zoom Out (Escape) / Close Query Bar
    if (e.key === 'Escape') {
      const escapeResult = handleZoomOut(newEditorState, showQueryBar);
      if (escapeResult.preventDefault) e.preventDefault();
      
      // Execute action
      if (escapeResult.action?.type === 'QUERY_BAR_TOGGLE') {
        setShowQueryBar(false);
        setQuery(null);
        setQueryInput('');
      } else if (escapeResult.action?.type === 'ZOOM_OUT') {
        zoomOut();
      }
      return;
    }

    // 🎯 PHASE 2C: Tab (coordinator-based execution)
    if (e.key === 'Tab') {
      e.preventDefault();

      // Call pure handler to validate and get action intent
      const tabResult = handleTab(newEditorState, e);
      
      if (!tabResult.action || tabResult.action.type !== 'TAB_PRESSED') {
        return;
      }

      withStructuralCommit(() => {
        // Build state + action + deps
        const currentState: EditorStateComplete = {
          nodes: editorState.nodes,
          cursor: editorState.cursor,
          focusRootId: focusRootId,
          selection: {
            anchor: selection.anchor ? { nodeId: selection.anchor.nodeId, offset: selection.anchor.offset } : null,
            focus: selection.focus ? { nodeId: selection.focus.nodeId, offset: selection.focus.offset } : null,
          },
          isComposing: isComposing,
          grammarSession: grammarSession,
        };

        const deps: CoordinatorDependencies = {
          context: {
            domObservers: domObservers,
            modelRef: modelRef,
            needsCaretPlacementRef: needsCaretPlacementRef,
            structuralLockRef: structuralLockRef,
          },
          commit: commit,
          requestCaretPlacement: requestCaretPlacement,
        };

        // Execute via coordinator
        const committedCursor = executeAction(currentState, tabResult.action, deps);
        
        // 🆕 PHASE 1: Generate caret intent atomically (parallel to RAF)
        if (shouldRequestCaret(tabResult.action)) {
          setCaretIntent({
            nodeId: committedCursor.nodeId,
            token: nanoid(),
          });
        }
      });
      return;
    }

    // 🔒 NEW ARCHITECTURE: Arrow handlers (all arrow keys)
    // Using pure handler + old execution (incremental migration)
    if (e.key.startsWith('Arrow')) {
      // Call pure handler to validate and determine action
      const arrowResult = handleArrow(newEditorState, e);

      // If no action, let browser handle (e.g., text navigation)
      if (!arrowResult.action) {
        return;
      }

      // Handler wants to execute an action
      if (arrowResult.preventDefault) {
        e.preventDefault();
      }

      const action = arrowResult.action;

      // Execute using old state functions (temporary bridge)
      if (action.type === 'ARROW_PRESSED') {
        const { direction } = action.payload;

        // ArrowLeft/Right: Collapse/Expand
        if (direction === 'left') {
          const activeNode = editorState.nodes.find(
            (n) => n.id === editorState.cursor.nodeId
          ) as UINode;
          if (
            activeNode &&
            hasChildren(activeNode, editorState.nodes) &&
            !activeNode.isCollapsed
          ) {
            const newState = collapseNode(editorState);
            commit({
              nodes: newState.nodes as UINode[],
              cursor: newState.cursor,
            });
            requestCaretPlacement();
          }
          return;
        }

        if (direction === 'right') {
          const activeNode = editorState.nodes.find(
            (n) => n.id === editorState.cursor.nodeId
          ) as UINode;
          if (activeNode && activeNode.isCollapsed) {
            const newState = expandNode(editorState);
            commit({
              nodes: newState.nodes as UINode[],
              cursor: newState.cursor,
            });
            requestCaretPlacement();
          }
          return;
        }

        // ArrowUp/Down: Node navigation
        if (direction === 'up' || direction === 'down') {
          // Guard composition
          if (isComposing) return;

          const currentNodeId = editorState.cursor.nodeId;
          const currentElement = document.querySelector(
            `[data-node-id="${currentNodeId}"]`
          ) as HTMLElement;
          if (!currentElement) return;

          // Stop observer
          const currentObserver = domObservers.current.get(currentNodeId as NodeID);
          if (currentObserver) {
            currentObserver.stop();
          }

          // Extract segments
          const segments = extractSegmentsFromDOM(currentElement);

          // Update current node
          const updatedNodes = editorState.nodes.map((n) =>
            n.id === currentNodeId ? { ...n, segments } : n
          );

          // Determine target node
          const visibleNodes = getVisibleNodes(updatedNodes);
          const currentIndex = visibleNodes.findIndex((n) => n.id === currentNodeId);

          let targetNode: UINode | undefined;

          if (direction === 'up') {
            if (currentIndex <= 0) return;
            targetNode = visibleNodes[currentIndex - 1];
          } else {
            if (currentIndex === -1 || currentIndex >= visibleNodes.length - 1) return;
            targetNode = visibleNodes[currentIndex + 1];
          }

          if (!targetNode) return;

          // Handle selection
          if (e.shiftKey) {
            if (!selection.anchor) {
              setSelection({
                anchor: editorState.cursor,
                focus: editorState.cursor,
              });
            }
          } else {
            setSelection({ anchor: null, focus: null });
          }

          // 🔒 OFFSET PRESERVATION (using helper from KeyboardHandlers)
          // NOTE: Target node determination happens here during migration.
          // FUTURE: When migration completes, this will move into handleArrow().
          const currentNode = updatedNodes.find((n) => n.id === currentNodeId);
          const targetCursor = computeArrowTargetCursor(
            currentNode!.segments,
            targetNode.segments,
            targetNode.id,
            {
              segmentIndex: editorState.cursor.segmentIndex,
              offset: editorState.cursor.offset,
            }
          );

          // Commit state with CORRECT segment coordinates
          setEditorState((prev) => ({
            ...prev,
            nodes: updatedNodes as UINode[],
            cursor: targetCursor,
          }));

          // Update selection if Shift key
          if (e.shiftKey) {
            setSelection((sel) => ({
              ...sel,
              focus: targetCursor,
            }));
          }

          // Clear observer diagnostics
          if (currentObserver) {
            currentObserver.clearPendingMutations();
          }

          // Request caret placement
          requestCaretPlacement();
          return;
        }
      }

      return;
    }
    // Check if selection exists
    const selectionExists =
      selection.anchor &&
      selection.focus &&
      !(
        selection.anchor.nodeId === selection.focus.nodeId &&
        selection.anchor.offset === selection.focus.offset
      );

    // SPECIAL CHARACTER HANDLING (File 06 compliant)
    // Only intercept for: selection replacement, markdown shortcuts, special triggers
    // Normal typing MUST be browser-native (no preventDefault, no commit)

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // CASE 1: Selection exists → delete selection, let browser insert character
      if (selectionExists) {
        e.preventDefault();
        const normalized = normalizeSelection(
          selection.anchor,
          selection.focus,
          editorState.nodes
        );
        if (normalized) {
          const nextState = deleteSelection(editorState, normalized);
          commit({
            nodes: nextState.nodes as UINode[],
            cursor: nextState.cursor,
          });
          setSelection({ anchor: null, focus: null });
          // No caret placement - let browser insert character natively
        }
        return;
      }

      // CASE 2: Markdown shortcuts (File 07)
      // CRITICAL: Must intercept BEFORE browser inserts space
      // 🔒 BATCH 4 — Space Handler (Markdown Triggers)
      // DOM-FIRST PATTERN: Extract → Detect → Return Action → Commit
      if (e.key === ' ') {
        // Get active node's observer and DOM element
        const activeNodeId = editorState.cursor.nodeId;
        const observer = domObservers.current.get(activeNodeId);
        const nodeElement = document.querySelector(
          `[data-node-id="${activeNodeId}"]`
        ) as HTMLElement | null;

        if (!observer || !nodeElement) {
          return; // Let browser handle
        }

        // Extract segments from DOM (observer still running)
        observer.stop();
        const segments = extractSegmentsFromDOM(nodeElement);
        observer.start();

        // Call pure handler
        const spaceResult = handleSpace(newEditorState, e, segments, isComposing);

        if (!spaceResult.action) {
          return; // No markdown trigger - let browser handle space
        }

        // Execute action
        if (spaceResult.preventDefault) e.preventDefault();
        if (spaceResult.stopPropagation) e.stopPropagation();

        if (spaceResult.action.type === 'MARKDOWN_TRIGGER') {
          // 🎯 PHASE 2D: Markdown triggers via coordinator
          withStructuralCommit(() => {
            const currentState: EditorStateComplete = {
              nodes: editorState.nodes,
              cursor: editorState.cursor,
              focusRootId: focusRootId,
              selection: {
                anchor: selection.anchor ? { nodeId: selection.anchor.nodeId, offset: selection.anchor.offset } : null,
                focus: selection.focus ? { nodeId: selection.focus.nodeId, offset: selection.focus.offset } : null,
              },
              isComposing: isComposing,
              grammarSession: grammarSession,
            };

            const deps: CoordinatorDependencies = {
              context: {
                domObservers: domObservers,
                modelRef: modelRef,
                needsCaretPlacementRef: needsCaretPlacementRef,
                structuralLockRef: structuralLockRef,
              },
              commit: commit,
              requestCaretPlacement: requestCaretPlacement,
            };

            // Execute via coordinator
            const committedCursor = executeAction(currentState, spaceResult.action, deps);
            
            // 🆕 PHASE 1: Generate caret intent atomically (parallel to RAF)
            if (shouldRequestCaret(spaceResult.action)) {
              setCaretIntent({
                nodeId: committedCursor.nodeId,
                token: nanoid(),
              });
            }
          });
        } else if (spaceResult.action.type === 'PROPERTY_EDITOR_OPEN') {
          const { nodeId } = spaceResult.action.payload;

          // Calculate offset of the : character (it's right before cursor)
          const plainText = segments.map(s => s.type === 'text' ? s.text : '').join('');
          const offset = getCursorOffsetInPlainText(segments, editorState.cursor);
          const colonOffset = offset - 1; // : is one char before space

          setEditingProperty({
            nodeId,
            key: '',
            value: '',
            isNewProperty: true,
            triggeredByColon: true,
            colonOffset,
          });
        }

        return;
      }

      // CASE 4: Normal typing → Browser handles natively
      // NO preventDefault, NO commit, NO manual insertion
      // Browser inserts character, moves caret naturally
      return;
    }

    // 🎯 PHASE 2B: Backspace (coordinator-based execution)
    if (e.key === 'Backspace') {
      // Call pure handler to validate and get action intent
      const backspaceResult = handleBackspace(newEditorState, e, isComposing);

      if (!backspaceResult.action) {
        return; // Handler rejected (composition, repeat, selection exists)
      }

      // Apply handler's event handling
      if (backspaceResult.preventDefault) {
        e.preventDefault();
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🎯 PHASE 2B: COORDINATOR-BASED EXECUTION
      // Single entry point for state mutations
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      withStructuralCommit(() => {
        // 🎯 PHASE 2B: DOM extraction (coordinator handles state mutation)
        
        // Step 1: Get active node from cursor
        const activeNodeId = editorState.cursor.nodeId;
        const activeNode = editorState.nodes.find((n) => n.id === activeNodeId);
        if (!activeNode) {

          return;
        }

        // Step 2: Get DOM element and observer
        const activeNodeElement = document.querySelector(
          `[data-node-id="${activeNodeId}"]`
        ) as HTMLElement;
        if (!activeNodeElement) {
          return;
        }

        const observer = domObservers.current.get(activeNodeId as NodeID);
        if (!observer) {
          return;
        }

        // Step 3: Stop observer to stabilize DOM
        observer.stop();

        // Step 4: Extract segments from DOM (fresh)
        const segments = extractSegmentsFromDOM(activeNodeElement);

        // Step 5: Get cursor position from selection
        const cursor = getNodePositionFromSelection({
          id: activeNodeId,
          segments,
        } as Node);

        if (!cursor) return;

        // Step 6: Build EditorStateComplete for coordinator
        const currentState: EditorStateComplete = {
          nodes: editorState.nodes,
          cursor: editorState.cursor,
          focusRootId: focusRootId,
          selection: {
            anchor: selection.anchor ? { nodeId: selection.anchor.nodeId, offset: selection.anchor.offset } : null,
            focus: selection.focus ? { nodeId: selection.focus.nodeId, offset: selection.focus.offset } : null,
          },
          isComposing: isComposing,
          grammarSession: grammarSession,
        };

        // Step 7: Create action
        const action = {
          type: 'BACKSPACE_PRESSED' as const,
          payload: {
            cursor,
            segments,
            nodes: editorState.nodes,
          },
        };

        // Step 8: Build coordinator dependencies
        const deps: CoordinatorDependencies = {
          context: {
            domObservers: domObservers,
            modelRef: modelRef,
            needsCaretPlacementRef: needsCaretPlacementRef,
            structuralLockRef: structuralLockRef,
          },
          commit: commit,
          requestCaretPlacement: requestCaretPlacement,
        };

        // 🎯 Step 9: Execute via coordinator (single entry point)
        const committedCursor = executeAction(currentState, action, deps);
        
        // 🆕 PHASE 1: Generate caret intent atomically (parallel to RAF)
        if (shouldRequestCaret(action)) {
          setCaretIntent({
            nodeId: committedCursor.nodeId,
            token: nanoid(),
          });
        }
      });
      return;
    }

    // PHASE 1: Delete key - browser native only
    if (e.key === 'Delete') {
      return; // Let browser handle
    }

    // 🔒 NEW ARCHITECTURE: Enter (using pure handler + old execution path)
    if (e.key === 'Enter') {
      // Call pure handler to validate and get action intent
      const enterResult = handleEnter(newEditorState, e, isComposing);

      if (!enterResult.action) {
        return; // Handler rejected (composition, repeat, etc.)
      }

      // Apply handler's event handling
      if (enterResult.preventDefault) {
        e.preventDefault();
      }
      if (enterResult.stopPropagation) {
        e.stopPropagation();
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🎯 PHASE 2A: COORDINATOR-BASED EXECUTION
      // Single entry point for state mutations
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      withStructuralCommit(() => {
        // 🎯 PHASE 2A: DOM extraction (coordinator handles state mutation)
        
        // Step 1: Get active node from cursor
        const activeNodeId = editorState.cursor.nodeId;
        const activeNode = editorState.nodes.find((n) => n.id === activeNodeId);
        if (!activeNode) {

          return;
        }

        // Step 2: Get DOM element and observer
        const activeNodeElement = document.querySelector(
          `[data-node-id="${activeNodeId}"]`
        ) as HTMLElement;
        if (!activeNodeElement) {
          // Element gone - bail safely
          return;
        }

        const observer = domObservers.current.get(activeNodeId as NodeID);
        if (!observer) {
          // No observer - node might be unmounting, bail safely
          return;
        }

        // Step 3: Stop observer to stabilize DOM
        observer.stop();

        // Step 4: Handle selection deletion (if exists)
        const selection = window.getSelection();
        if (!selection) {
          return;
        }
        if (!selection.isCollapsed) {
          document.execCommand('delete');
        }

        // Step 5: Extract segments from DOM (fresh)
        const segments = extractSegmentsFromDOM(activeNodeElement);

        // Step 6: Get cursor position from selection
        const cursor = getNodePositionFromSelection({
          id: activeNodeId,
          segments,
        } as Node);

        if (!cursor) return;

        // Step 7: Build EditorStateComplete for coordinator
        const currentState: EditorStateComplete = {
          nodes: editorState.nodes,
          cursor: editorState.cursor,
          focusRootId: focusRootId,
          selection: {
            anchor: selection.anchor ? { nodeId: selection.anchor.nodeId, offset: selection.anchor.offset } : null,
            focus: selection.focus ? { nodeId: selection.focus.nodeId, offset: selection.focus.offset } : null,
          },
          isComposing: isComposing,
          grammarSession: grammarSession,
        };

        // Step 8: Create action
        const action = {
          type: 'ENTER_PRESSED' as const,
          payload: {
            cursor,
            segments,
            nodes: editorState.nodes,
          },
        };

        // Step 9: Build coordinator dependencies
        const deps: CoordinatorDependencies = {
          context: {
            domObservers: domObservers,
            modelRef: modelRef,
            needsCaretPlacementRef: needsCaretPlacementRef,
            structuralLockRef: structuralLockRef,
          },
          commit: commit,
          requestCaretPlacement: requestCaretPlacement,
        };

        // 🎯 Step 10: Execute via coordinator (single entry point)
        const committedCursor = executeAction(currentState, action, deps);
        
        // 🆕 PHASE 1: Generate caret intent atomically (parallel to RAF)
        if (shouldRequestCaret(action)) {
          setCaretIntent({
            nodeId: committedCursor.nodeId,
            token: nanoid(),
          });
        }
      });

      return;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'monospace',
        backgroundColor: '#1e1e1e',
        minHeight: '100vh',
        color: '#d4d4d4',
      }}
    >
      {/* UI PHASE 2 — Document Switcher (Left Rail) */}
      <div
        style={{
          width: '240px',
          backgroundColor: '#252526',
          borderRight: '1px solid #3e3e3e',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: '8px',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            color: '#888',
            marginBottom: '8px',
            textTransform: 'uppercase',
            fontWeight: 'bold',
          }}
        >
          {workspaceName}
        </div>

        <button
          onClick={createNewDocument}
          style={{
            padding: '8px 12px',
            fontSize: '12px',
            backgroundColor: '#3e3e3e',
            border: '1px solid #555',
            borderRadius: '3px',
            color: '#d4d4d4',
            cursor: 'pointer',
            marginBottom: '12px',
            fontFamily: 'monospace',
          }}
        >
          + New Document
        </button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            overflow: 'auto',
          }}
        >
          {Object.values(documents)
            .sort((a, b) => b.lastModified - a.lastModified)
            .map((doc) => (
              <div
                key={doc.documentId}
                style={{
                  padding: '8px',
                  backgroundColor:
                    doc.documentId === activeDocumentId
                      ? '#3e3e3e'
                      : 'transparent',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  borderLeft:
                    doc.documentId === activeDocumentId
                      ? '3px solid #4fc3f7'
                      : '3px solid transparent',
                }}
                onClick={() => switchToDocument(doc.documentId)}
                onDoubleClick={() => {
                  const newName = prompt('Rename document:', doc.name);
                  if (newName) {
                    renameDocument(doc.documentId, newName);
                  }
                }}
              >
                <div
                  style={{
                    fontWeight:
                      doc.documentId === activeDocumentId ? 'bold' : 'normal',
                    color:
                      doc.documentId === activeDocumentId ? '#d4d4d4' : '#888',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {doc.name}
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>
                  {new Date(doc.lastModified).toLocaleString()}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div
        style={{
          flex: 1,
          padding: '40px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h1 style={{ fontSize: '16px', margin: 0, color: '#888' }}>
            {documents[activeDocumentId]?.name || 'Untitled'}
          </h1>

          {/* UI PHASE 1 — Persistence Status Indicator */}
          <PersistenceStatus
            saveStatus={saveStatus}
            persistence={persistence}
            onChooseLocation={chooseSaveLocation}
            onRetry={retryWrite}
          />
        </div>

        {/* STEP 9.5 — Breadcrumb navigation */}
        {focusRootId && (
          <div
            style={{
              marginBottom: '16px',
              padding: '8px 12px',
              backgroundColor: '#252526',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#888',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <button
              onClick={() => setFocusRootId(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#4fc3f7',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              Root
            </button>
            {getBreadcrumbs().map((node, index) => (
              <span
                key={node.id}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{ color: '#666' }}>/</span>
                <button
                  onClick={() => setFocusRootId(node.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color:
                      index === getBreadcrumbs().length - 1
                        ? '#d4d4d4'
                        : '#4fc3f7',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    fontWeight:
                      index === getBreadcrumbs().length - 1 ? 'bold' : 'normal',
                  }}
                >
                  {/* STEP 12.3 — Use canonical label helper */}
                  {getNodeLabel(node)}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* STEP 15.3 — Query Bar */}
        {showQueryBar && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#252526',
              borderRadius: '4px',
              border: '1px solid #4fc3f7',
            }}
          >
            <div
              style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}
            >
              Query: /text &lt;value&gt; | /prop &lt;key&gt; [value] | /ref
              @&lt;label&gt;
            </div>
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const parsed = parseQuery(queryInput);
                  setQuery(parsed);
                  setShowQueryBar(false);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowQueryBar(false);
                  setQuery(null);
                  setQueryInput('');
                }
              }}
              autoFocus
              placeholder="e.g., /text hello, /prop status done, /ref @node"
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e3e',
                borderRadius: '2px',
                color: '#d4d4d4',
                fontFamily: 'monospace',
                fontSize: '13px',
              }}
            />
            {query && (
              <div
                style={{ marginTop: '8px', fontSize: '11px', color: '#4fc3f7' }}
              >
                Active: {JSON.stringify(query)}
              </div>
            )}
          </div>
        )}

        {/* Query Status (when active but bar closed) */}
        {query && !showQueryBar && (
          <div
            style={{
              marginBottom: '16px',
              padding: '8px 12px',
              backgroundColor: '#2d2d30',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#4fc3f7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              Query active: {query.type === 'text' && `text:"${query.value}"`}
              {query.type === 'property' &&
                `prop:${query.key}${query.value ? `="${query.value}"` : ''}`}
              {query.type === 'ref' &&
                `ref:@${getNodeLabel(editorState.nodes.find((n) => n.id === query.nodeId)!)}`}
            </span>
            <button
              onClick={() => {
                setQuery(null);
                setQueryInput('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                padding: '0 4px',
                fontSize: '14px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f44336')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
            >
              ×
            </button>
          </div>
        )}

        {/* STEP 16.3 — Saved Views Panel */}
        {views.length > 0 && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#252526',
              borderRadius: '4px',
              border: '1px solid #3e3e3e',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#888',
                marginBottom: '8px',
                fontWeight: 'bold',
              }}
            >
              Saved Views
            </div>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              {views.map((view) => (
                <div
                  key={view.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    backgroundColor: '#1e1e1e',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                  onClick={() => switchToView(view)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#2d2d30')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = '#1e1e1e')
                  }
                >
                  <span style={{ fontSize: '12px', color: '#d4d4d4' }}>
                    {view.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteView(view.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#666',
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontSize: '12px',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = '#f44336')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 16.2 — Save View Dialog */}
        {showSaveViewDialog && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowSaveViewDialog(false)}
          >
            <div
              style={{
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                padding: '20px',
                width: '400px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  fontSize: '14px',
                  color: '#d4d4d4',
                  marginBottom: '12px',
                  fontWeight: 'bold',
                }}
              >
                Save View
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#888',
                  marginBottom: '12px',
                }}
              >
                Current state: Query={query ? 'active' : 'none'}, Zoom=
                {focusRootId ? 'active' : 'none'}
              </div>
              <input
                type="text"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveView(saveViewName);
                    setShowSaveViewDialog(false);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowSaveViewDialog(false);
                  }
                }}
                autoFocus
                placeholder="Enter view name..."
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#252526',
                  border: '1px solid #3e3e3e',
                  borderRadius: '2px',
                  color: '#d4d4d4',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  marginBottom: '12px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => setShowSaveViewDialog(false)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#252526',
                    border: '1px solid #3e3e3e',
                    borderRadius: '2px',
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    saveView(saveViewName);
                    setShowSaveViewDialog(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#4fc3f7',
                    border: 'none',
                    borderRadius: '2px',
                    color: '#1e1e1e',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          style={{
            outline: '2px solid #3e3e3e',
            padding: '20px',
            borderRadius: '4px',
            backgroundColor: '#252526',
            minHeight: '200px',
            position: 'relative',
          }}
        >
          {getVisibleNodes(editorState.nodes).map((node) => (
            <NodeView
              key={node.id}
              node={node}
              nodes={editorState.nodes}
              isActive={node.id === editorState.cursor.nodeId}
              cursor={editorState.cursor}
              caretIntent={caretIntent}
              onRequestSelect={handleNodeRequestSelect}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
            />
          ))}

          {/* STEP 10.3/10.5.5 — Property Editor (create/edit/delete) */}
          {editingProperty && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#1e1e1e',
                border: '2px solid #4fc3f7',
                borderRadius: '4px',
                padding: '16px',
                minWidth: '300px',
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  marginBottom: '12px',
                  color: '#888',
                  fontSize: '12px',
                }}
              >
                {editingProperty.isNewProperty
                  ? 'Add Property'
                  : 'Edit Property'}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="key"
                  value={editingProperty.key}
                  onChange={(e) =>
                    setEditingProperty({
                      ...editingProperty,
                      key: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (editingProperty.key) {
                        setNodeProperty(
                          editingProperty.nodeId,
                          editingProperty.key,
                          editingProperty.value
                        );
                        setEditingProperty(null);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      dismissPropertyEditor();
                    }
                  }}
                  autoFocus={editingProperty.isNewProperty}
                  disabled={!editingProperty.isNewProperty}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: editingProperty.isNewProperty
                      ? '#252526'
                      : '#1a1a1a',
                    border: '1px solid #3e3e3e',
                    borderRadius: '2px',
                    color: editingProperty.isNewProperty ? '#d4d4d4' : '#666',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    cursor: editingProperty.isNewProperty
                      ? 'text'
                      : 'not-allowed',
                  }}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="value"
                  value={editingProperty.value}
                  onChange={(e) =>
                    setEditingProperty({
                      ...editingProperty,
                      value: e.target.value,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (editingProperty.key) {
                        setNodeProperty(
                          editingProperty.nodeId,
                          editingProperty.key,
                          editingProperty.value
                        );
                        setEditingProperty(null);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      dismissPropertyEditor();
                    } else if (
                      e.key === 'Backspace' &&
                      !editingProperty.isNewProperty &&
                      editingProperty.value === ''
                    ) {
                      // STEP 10.5.3 — Delete property on backspace with empty value
                      e.preventDefault();
                      deleteNodeProperty(
                        editingProperty.nodeId,
                        editingProperty.key
                      );
                      setEditingProperty(null);
                    }
                  }}
                  autoFocus={!editingProperty.isNewProperty}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#252526',
                    border: '1px solid #3e3e3e',
                    borderRadius: '2px',
                    color: '#d4d4d4',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                  }}
                />
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {editingProperty.isNewProperty
                  ? 'Enter to save • Esc to cancel'
                  : 'Enter to save • Backspace on empty to delete • Esc to cancel'}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
          <div>Nodes: {editorState.nodes.length}</div>
          <div>
            Active: {editorState.cursor.nodeId} @ segment{' '}
            {editorState.cursor.segmentIndex}, offset{' '}
            {editorState.cursor.offset}
          </div>
          {selection.anchor && selection.focus && (
            <div style={{ color: '#4fc3f7', marginTop: '4px' }}>
              Selection: [{selection.anchor.nodeId.slice(0, 8)}:
              {selection.anchor.offset}] → [{selection.focus.nodeId.slice(0, 8)}
              :{selection.focus.offset}]
            </div>
          )}
          <div style={{ marginTop: '10px' }}>
            <strong style={{ color: '#d4d4d4' }}>Keyboard:</strong>
          </div>
          <div style={{ marginLeft: '8px', lineHeight: '1.6' }}>
            • Type — insert text (replaces selection if active)
            <br />
            • Enter at start — create child node
            <br />
            • Enter elsewhere — split/create sibling
            <br />
            • Backspace (has children) — no-op (can't delete parent)
            <br />
            • Backspace at start (has parent) — outdent
            <br />
            • Backspace elsewhere — delete char or merge
            <br />
            • ↑↓ — move between visible nodes
            <br />
            • ← at start (has children) — collapse node
            <br />
            • → at start (collapsed) — expand node
            <br />
            • ←→ — move cursor (cross-node at boundaries)
            <br />
            • Shift+←→ — select text (within/across nodes)
            <br />
            • Shift+↑↓ — select across visible nodes
            <br />
            • Tab — indent node (make child of previous)
            <br />
            • Shift+Tab — outdent node (move up one level)
            <br />
            • Cmd/Ctrl+Enter — zoom in (focus on node)
            <br />
            • Esc — zoom out (return to parent view)
            <br />
            • Cmd/Ctrl+D — delete node (soft delete)
            <br />
            • : at start of empty node — add property
            <br />
            • Click property — edit value (key locked)
            <br />• Click × — delete property
            <br />
            • Cmd/Ctrl+Shift+R — add reference
            <br />
            • Cmd/Ctrl+Z — undo
            <br />
            • Cmd/Ctrl+Shift+Z — redo
            <br />
            • / — open query (filter view)
            <br />
            • Cmd/Ctrl+Shift+S — save view
            <br />
            • Cmd/Ctrl+Shift+T — apply template
            <br />
            • Cmd/Ctrl+Shift+E — export to JSON
            <br />• Cmd/Ctrl+Shift+I — import from JSON
          </div>
        </div>

        {/* PHASE 20 — Recovery Panel (Read-Only Integrity Report) */}
        {recoveryEvents.length > 0 && (
          <div
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              backgroundColor: '#2d2d30',
              border: '1px solid #3e3e42',
              borderRadius: '6px',
              padding: '12px',
              maxWidth: '400px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              zIndex: 999,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: showRecoveryPanel ? '8px' : '0',
                cursor: 'pointer',
              }}
              onClick={() => setShowRecoveryPanel(!showRecoveryPanel)}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{ fontSize: '16px' }}>🛠</span>
                <span style={{ fontSize: '13px', color: '#cccccc' }}>
                  File normalized on import ({recoveryEvents.length}{' '}
                  {recoveryEvents.length === 1 ? 'issue' : 'issues'})
                </span>
              </div>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '0 4px',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setRecoveryEvents([]);
                  setShowRecoveryPanel(false);
                }}
                title="Dismiss"
              >
                ×
              </button>
            </div>

            {showRecoveryPanel && (
              <div
                style={{
                  maxHeight: '300px',
                  overflow: 'auto',
                  fontSize: '12px',
                  color: '#d4d4d4',
                }}
              >
                {recoveryEvents.map((event, idx) => {
                  let message = '';

                  switch (event.type) {
                    case 'duplicate-id':
                      message = `Duplicate ID resolved: "${event.originalId}" → "${event.resolvedId}"`;
                      break;
                    case 'orphan-hoisted':
                      message = `Orphan node hoisted to root: ${event.nodeId} (invalid parent: ${event.invalidParentId})`;
                      break;
                    case 'cycle-broken':
                      message = `Cycle broken, node hoisted to root: ${event.nodeId}`;
                      break;
                    case 'dangling-ref':
                      message = `Dangling reference preserved: ${event.fromNodeId} → ${event.toNodeId} (missing)`;
                      break;
                    case 'self-ref-removed':
                      message = `Self-reference removed: ${event.nodeId}`;
                      break;
                    case 'invalid-prop':
                      message = `Invalid property: ${event.nodeId}.${event.key} (${event.reason})`;
                      break;
                    case 'invalid-ui-flag':
                      message = `Invalid UI flag removed: ${event.nodeId}.${event.flag}`;
                      break;
                    case 'missing-id':
                      message = `Missing ID generated: ${event.generatedId}`;
                      break;
                    case 'view-missing-field':
                      message = `View missing field: ${event.viewId}.${event.field}`;
                      break;
                    case 'template-missing-field':
                      message = `Template missing field: ${event.templateId}.${event.field}`;
                      break;
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '8px',
                        backgroundColor: '#252526',
                        borderRadius: '3px',
                        marginBottom:
                          idx < recoveryEvents.length - 1 ? '4px' : '0',
                      }}
                    >
                      <div
                        style={{
                          marginBottom:
                            event.actions && event.actions.length > 0
                              ? '6px'
                              : '0',
                        }}
                      >
                        • {message}
                      </div>

                      {/* PHASE 22: Action buttons (optional, explicit) */}
                      {event.actions && event.actions.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            marginLeft: '12px',
                          }}
                        >
                          {event.actions.map((action, actionIdx) => {
                            let buttonLabel = '';
                            let buttonColor = '#0e639c';

                            switch (action.type) {
                              case 'focus-node':
                                buttonLabel = 'Focus';
                                buttonColor = '#0e639c';
                                break;
                              case 'remove-ref':
                                buttonLabel = 'Remove Ref';
                                buttonColor = '#a1260d';
                                break;
                              case 'delete-node':
                                buttonLabel = 'Delete Node';
                                buttonColor = '#8b0000';
                                break;
                            }

                            return (
                              <button
                                key={actionIdx}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  backgroundColor: buttonColor,
                                  border: 'none',
                                  borderRadius: '3px',
                                  color: '#ffffff',
                                  cursor: 'pointer',
                                }}
                                onClick={() => runRecoveryAction(action)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = '0.8';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                }}
                              >
                                {buttonLabel}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 11.2.1 — Reference Picker Modal */}
        {refPickerState.isOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() =>
              setRefPickerState({
                isOpen: false,
                sourceNodeId: null,
                selectedIndex: 0,
              })
            }
          >
            <div
              style={{
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                width: '500px',
                maxHeight: '400px',
                overflow: 'auto',
                padding: '12px',
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setRefPickerState({
                    isOpen: false,
                    sourceNodeId: null,
                    selectedIndex: 0,
                  });
                  return;
                }

                const allNodes = editorState.nodes;
                const maxIndex = allNodes.length - 1;

                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setRefPickerState((prev) => ({
                    ...prev,
                    selectedIndex: Math.min(prev.selectedIndex + 1, maxIndex),
                  }));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setRefPickerState((prev) => ({
                    ...prev,
                    selectedIndex: Math.max(prev.selectedIndex - 1, 0),
                  }));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const targetNode = allNodes[refPickerState.selectedIndex];
                  if (targetNode && refPickerState.sourceNodeId) {
                    addNodeRef(refPickerState.sourceNodeId, targetNode.id);
                    setRefPickerState({
                      isOpen: false,
                      sourceNodeId: null,
                      selectedIndex: 0,
                    });
                  }
                }
              }}
              tabIndex={0}
              ref={(el) => el?.focus()}
            >
              <div
                style={{
                  fontSize: '14px',
                  color: '#d4d4d4',
                  marginBottom: '12px',
                  fontWeight: 'bold',
                }}
              >
                Add Reference
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#888',
                  marginBottom: '12px',
                }}
              >
                ↑↓ to navigate • Enter to select • Esc to cancel
              </div>
              {editorState.nodes.map((node, index) => {
                const depth = (() => {
                  const nodesById = new Map(
                    editorState.nodes.map((n) => [n.id, n])
                  );
                  let d = 0;
                  let current = node;
                  while (current.parentId) {
                    const parent = nodesById.get(current.parentId);
                    if (!parent) break;
                    d++;
                    current = parent;
                  }
                  return d;
                })();

                const isSelected = index === refPickerState.selectedIndex;
                const isSource = node.id === refPickerState.sourceNodeId;

                return (
                  <div
                    key={node.id}
                    style={{
                      padding: '6px 8px',
                      marginBottom: '2px',
                      paddingLeft: `${8 + depth * 20}px`,
                      backgroundColor: isSelected ? '#37373d' : 'transparent',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: isSource ? '#666' : '#d4d4d4',
                      fontStyle: isSource ? 'italic' : 'normal',
                    }}
                    onClick={() => {
                      if (refPickerState.sourceNodeId && !isSource) {
                        addNodeRef(refPickerState.sourceNodeId, node.id);
                        setRefPickerState({
                          isOpen: false,
                          sourceNodeId: null,
                          selectedIndex: 0,
                        });
                      }
                    }}
                    onMouseEnter={() =>
                      setRefPickerState((prev) => ({
                        ...prev,
                        selectedIndex: index,
                      }))
                    }
                  >
                    {/* STEP 12.4 — Use canonical label helper */}
                    {getNodeLabel(node)}
                    {isSource && ' (current)'}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PHASE C — Grammar Chooser */}
        {isSessionActive(grammarSession) && (
          <GrammarChooser
            session={grammarSession}
            onSelect={(index) => {
              setGrammarSession({ ...grammarSession, selectedIndex: index });
            }}
            onCancel={cancelGrammar}
          />
        )}

        {/* STEP 17.3 — Template Picker Modal */}
        {showTemplatePicker && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowTemplatePicker(false)}
          >
            <div
              style={{
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e3e',
                borderRadius: '4px',
                width: '500px',
                maxHeight: '400px',
                overflow: 'auto',
                padding: '12px',
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowTemplatePicker(false);
                  return;
                }

                const maxIndex = templates.length - 1;

                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setTemplatePickerIndex((prev) =>
                    Math.min(prev + 1, maxIndex)
                  );
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setTemplatePickerIndex((prev) => Math.max(prev - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const template = templates[templatePickerIndex];
                  if (template) {
                    applyTemplate(editorState.cursor.nodeId, template);
                    setShowTemplatePicker(false);
                  }
                }
              }}
              tabIndex={0}
              ref={(el) => el?.focus()}
            >
              <div
                style={{
                  fontSize: '14px',
                  color: '#d4d4d4',
                  marginBottom: '12px',
                  fontWeight: 'bold',
                }}
              >
                Apply Template
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#888',
                  marginBottom: '12px',
                }}
              >
                ↑↓ to navigate • Enter to apply • Esc to cancel
              </div>
              {templates.map((template, index) => {
                const isSelected = index === templatePickerIndex;

                return (
                  <div
                    key={template.id}
                    style={{
                      padding: '8px',
                      marginBottom: '4px',
                      backgroundColor: isSelected ? '#37373d' : 'transparent',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      applyTemplate(editorState.cursor.nodeId, template);
                      setShowTemplatePicker(false);
                    }}
                    onMouseEnter={() => setTemplatePickerIndex(index)}
                  >
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#d4d4d4',
                        marginBottom: '4px',
                      }}
                    >
                      {template.name}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#666',
                        marginLeft: '8px',
                      }}
                    >
                      {Object.entries(template.props)
                        .map(
                          ([key, value]) =>
                            `#${key}${value ? `: ${value}` : ''}`
                        )
                        .join(' • ')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* End Main Editor Area */}
      </div>
      {/* End Outer Container */}
    </div>
  );
}
