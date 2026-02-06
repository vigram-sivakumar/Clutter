/**
 * NodeEditor — Node-Based Editor Component
 *
 * Wires EditorState kernel to DOM.
 *
 * Rules:
 * - No mutation
 * - No logic duplication
 * - No contenteditable
 * - Kernel is single source of truth
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Node, NodeID } from './engine/NodeKernel';
import {
  createNode,
  insertNodeAfter,
  insertNodeBefore,
  getNodeVariant,
  setNodeVariant,
} from './engine/NodeKernel';
import type { EditorState } from './engine/EditorState';
import { applyIntent } from './engine/EditorState';
import { NodeView } from './NodeView';
import {
  normalizePersistedState,
  type RecoveryEvent,
  type RecoveryAction,
  type PersistedState,
  type DocumentMetadata,
  type DocumentData,
  LATEST_VERSION,
} from './normalize';
import { migrateToLatest } from './migrations';
import { usePersistence, PersistenceStatus } from './ui/persistence';
import type { GrammarSession } from './ui/grammar/grammarSession';
import {
  EMPTY_GRAMMAR_SESSION,
  createGrammarSession,
  selectNextCandidate,
  selectPreviousCandidate,
  getSelectedCandidate,
  isSessionActive,
} from './ui/grammar/grammarSession';
import { GrammarChooser } from './ui/grammar/GrammarChooser';
import { detectGrammar, findWordAtCursor } from './input/detectGrammar';
import { resolveIntent } from './input/resolveIntent';
import { intentToCommand } from './input/grammarToCommand';
import { executeCommand } from './commands/executor';
import type { EditorContext } from './commands/executor';
import { syncPropertiesFromText } from './input/hashtagSync';
import {
  getNodePositionFromSelection,
  getSelectionRangeFromDOM,
} from './selection/domMapping';

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
 */
type SelectionState = {
  anchor: { nodeId: NodeID; offset: number } | null;
  focus: { nodeId: NodeID; offset: number } | null;
};

type EditorSnapshot = {
  nodes: UINode[];
  activeNodeId: NodeID;
  offset: number;
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
export function getNodeLabel(node: Node | UINode): string {
  // STEP 13.2 — Deleted nodes
  if ('isDeleted' in node && node.isDeleted) return '(deleted)';

  if (!node.text || node.text.trim() === '') return '(empty)';

  // Get first line
  const firstLine = node.text.split('\n')[0]?.trim();

  if (firstLine) {
    // Truncate if too long
    const maxLength = 50;
    return firstLine.length > maxLength
      ? firstLine.substring(0, maxLength) + '...'
      : firstLine;
  }

  return '(empty)';
}

export function NodeEditor() {
  // Initialize editor state
  const [editorState, setEditorState] = useState<EditorState>(() => {
    const node1 = createNode('paragraph', 'First node - try typing here');
    const node2 = createNode('paragraph', 'Second node');
    const node3 = createNode('heading', 'This is a heading');
    const node4 = createNode('paragraph', 'Node with properties and refs');

    // Add properties to node4
    node4.props = { status: 'active', priority: 'high' };

    // Add references to node4 (refs to node1 and node3)
    node4.refs = [node1.id, node3.id];

    const nodes: Node[] = [node1, node2, node3, node4];

    return {
      nodes,
      activeNodeId: nodes[0]!.id,
      offset: nodes[0]!.text.length, // Start at end of first node
    };
  });

  // Selection state (UI-only, not in kernel)
  const [selection, setSelection] = useState<{
    anchor: { nodeId: NodeID; offset: number } | null;
    focus: { nodeId: NodeID; offset: number } | null;
  }>({ anchor: null, focus: null });

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
   * Phase 5.1.4 — Document-level Selection Observer
   * Syncs browser selection changes to editor state
   */
  useEffect(() => {
    const handleSelectionChange = () => {
      const browserSelection = window.getSelection();
      if (!browserSelection) return;

      // Check if selection is inside our editor
      const containerEl = containerRef.current;
      if (!containerEl) return;

      const anchorInEditor = containerEl.contains(browserSelection.anchorNode);
      const focusInEditor = containerEl.contains(browserSelection.focusNode);

      if (!anchorInEditor || !focusInEditor) return;

      // Translate to editor state
      if (browserSelection.isCollapsed) {
        const position = getNodePositionFromSelection(browserSelection);
        if (position) {
          setEditorState({
            ...editorState,
            activeNodeId: position.nodeId,
            offset: position.offset,
          });
          setSelection({ anchor: null, focus: null });
        }
      } else {
        const range = getSelectionRangeFromDOM(browserSelection);
        if (range) {
          setEditorState({
            ...editorState,
            activeNodeId: range.focus.nodeId,
            offset: range.focus.offset,
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
   * STEP 14.2 + PHASE 3C — Commit State Changes (with history)
   *
   * All state mutations go through this function.
   * Pushes current state to history before applying new state.
   * PHASE 3C: Syncs hashtags from text to properties.
   */
  function commit(changes: {
    nodes?: UINode[];
    activeNodeId?: NodeID;
    offset?: number;
    focusRootId?: NodeID | null;
    selection?: SelectionState;
  }) {
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

    // STEP 14.2.1 — Create snapshot of current state
    const snapshot: EditorSnapshot = {
      nodes: editorState.nodes as UINode[],
      activeNodeId: editorState.activeNodeId,
      offset: editorState.offset,
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
      changes.activeNodeId !== undefined ||
      changes.offset !== undefined
    ) {
      setEditorState({
        nodes: finalNodes ?? editorState.nodes,
        activeNodeId: changes.activeNodeId ?? editorState.activeNodeId,
        offset: changes.offset ?? editorState.offset,
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

    // Create snapshot of current state for future
    const currentSnapshot: EditorSnapshot = {
      nodes: editorState.nodes as UINode[],
      activeNodeId: editorState.activeNodeId,
      offset: editorState.offset,
      focusRootId,
      selection,
    };

    setHistory({
      past: newPast,
      future: [currentSnapshot, ...history.future],
    });

    // Restore previous state
    setEditorState({
      nodes: previous.nodes,
      activeNodeId: previous.activeNodeId,
      offset: previous.offset,
    });
    setFocusRootId(previous.focusRootId);
    setSelection(previous.selection);
  }

  /**
   * STEP 14.3 — Redo Function
   */
  function redo() {
    if (history.future.length === 0) return;

    const next = history.future[0];
    if (!next) return;

    const newFuture = history.future.slice(1);

    // Create snapshot of current state for past
    const currentSnapshot: EditorSnapshot = {
      nodes: editorState.nodes as UINode[],
      activeNodeId: editorState.activeNodeId,
      offset: editorState.offset,
      focusRootId,
      selection,
    };

    setHistory({
      past: [...history.past, currentSnapshot],
      future: newFuture,
    });

    // Restore next state
    setEditorState({
      nodes: next.nodes,
      activeNodeId: next.activeNodeId,
      offset: next.offset,
    });
    setFocusRootId(next.focusRootId);
    setSelection(next.selection);
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

    // PHASE 3A/3B: Remove grammar text from node
    // For slash: "/todo" → removed
    // For mention: "@NodeName" → removed (reference is semantic)
    // For hashtag: "#status done" → kept (properties stay inline)
    const shouldRemoveText =
      grammarSession.grammar &&
      grammarSession.range &&
      (grammarSession.grammar.type === 'slash' ||
        grammarSession.grammar.type === 'mention');

    if (shouldRemoveText) {
      const activeNode = editorState.nodes.find(
        (n) => n.id === editorState.activeNodeId
      );
      if (activeNode) {
        const { from, to } = grammarSession.range;
        const newText =
          activeNode.text.slice(0, from) + activeNode.text.slice(to);

        // Update node text without grammar trigger
        const updatedNodes = editorState.nodes.map((n) =>
          n.id === activeNode.id ? { ...n, text: newText } : n
        );

        setEditorState({
          ...editorState,
          nodes: updatedNodes,
          offset: from, // Move cursor to where grammar started
        });
      }
    }

    // Convert intent to command
    const command = intentToCommand(candidate);
    if (!command) {
      console.error('Could not convert intent to command', candidate);
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
          setEditorState({ ...editorState, activeNodeId: nodeId, offset });
        },
        createNode: (
          nodeType: string,
          text: string,
          parentId?: NodeID | null,
          afterId?: NodeID | null
        ) => {
          // Validate and cast nodeType
          const validType: import('./engine/NodeKernel').NodeType =
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
            activeNodeId: newState.activeNodeId,
            offset: newState.offset,
          });
        },
        outdentNode: (nodeId: NodeID) => {
          const newState = outdentNode(editorState);
          commit({
            nodes: newState.nodes as UINode[],
            activeNodeId: newState.activeNodeId,
            offset: newState.offset,
          });
        },
        moveNode: (
          nodeId: NodeID,
          newParentId: NodeID | null,
          afterId: NodeID | null
        ) => {
          // Move not yet implemented in old system
          console.warn('Move command not yet implemented');
        },
        setNodeProperty: (nodeId: NodeID, key: string, value: string) =>
          setNodeProperty(nodeId, key, value),
        deleteNodeProperty: (nodeId: NodeID, key: string) =>
          deleteNodeProperty(nodeId, key),
        addReference: (fromNodeId: NodeID, toNodeId: NodeID) =>
          addNodeRef(fromNodeId, toNodeId),
        removeReference: (fromNodeId: NodeID, toNodeId: NodeID) => {
          // Remove not yet fully implemented
          console.warn('Remove reference not yet implemented');
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
          console.log('Manual save requested');
        },
        bindLocation: chooseSaveLocation,
        retrySave: retryWrite,
      },
    };

    // Execute command
    const result = executeCommand(command, context);

    if (result.status === 'error') {
      console.error('Command execution failed:', result.message);
    }

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
        (n) => n.id !== editorState.activeNodeId && !(n as UINode).isDeleted
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
      nodeId: editorState.activeNodeId,
      cursorOffset,
      documentId: activeDocumentId,
      workspaceId,
      availableNodes,
      availableDocuments,
      allProperties, // PHASE 3C
    };

    const detection = detectGrammar(text, context);

    if (detection.active) {
      // Resolve intent
      const resolution = resolveIntent(detection.grammar, context);

      // Create session
      const session = createGrammarSession(
        detection.grammar,
        resolution.candidates,
        text
      );

      setGrammarSession(session);
    } else {
      // No grammar active
      if (isSessionActive(grammarSession)) {
        setGrammarSession(EMPTY_GRAMMAR_SESSION);
      }
    }
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
        activeNodeId: node1.id,
        offset: 0,
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
        // Substring match (case-insensitive)
        return node.text.toLowerCase().includes(q.value.toLowerCase());

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
   * STEP 6.4 — Indent Node (Tab)
   * Makes previous visible node the parent
   */
  function indentNode(state: EditorState): EditorState {
    const { nodes, activeNodeId } = state;
    const visibleNodes = getVisibleNodes(nodes);
    const index = visibleNodes.findIndex((n) => n.id === activeNodeId);

    if (index <= 0) return state; // Cannot indent first node

    const newParent = visibleNodes[index - 1];
    if (!newParent) return state;

    return {
      ...state,
      nodes: nodes.map((n) =>
        n.id === activeNodeId ? { ...n, parentId: newParent.id } : n
      ),
    };
  }

  /**
   * STEP 6.4 — Outdent Node (Shift+Tab)
   * Moves to parent's parent
   */
  function outdentNode(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId);
    if (!node || !node.parentId) return state; // No parent to outdent from

    const parent = state.nodes.find((n) => n.id === node.parentId);

    return {
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === node.id ? { ...n, parentId: parent?.parentId ?? null } : n
      ),
    };
  }

  /**
   * STEP 7.2 — Create Child (Enter at start)
   * Creates a new child node under the current node
   */
  function createChild(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId);
    if (!node) return state;

    const child = createNode(node.type, '', node.id);
    const withChild = insertNodeAfter(state.nodes, node.id, child);

    return {
      nodes: withChild,
      activeNodeId: child.id,
      offset: 0,
    };
  }

  /**
   * Create Sibling Above (Enter at START of non-empty node)
   * Creates a new sibling node immediately before the current node
   * File 04 — Variant is sticky (preserved on Enter)
   */
  function createSiblingAbove(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId);
    if (!node) return state;

    const sibling = createNode(node.type, '', node.parentId);
    // File 04 — Preserve variant from current node
    sibling.props = { ...node.props };

    const withSibling = insertNodeBefore(state.nodes, node.id, sibling);

    return {
      nodes: withSibling,
      activeNodeId: sibling.id,
      offset: 0,
    };
  }

  /**
   * STEP 8.3 — Collapse Node
   * Hides all descendants
   */
  function collapseNode(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId) as UINode;
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
    const node = state.nodes.find((n) => n.id === state.activeNodeId) as UINode;
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
  } | null>(null);

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

      // 10.5.1 — Overwrite semantics (keys are unique)
      const props = { ...(n.props ?? {}) };
      props[key] = value; // Insertion order preserved by JS spec (ES2015+)

      return { ...n, props };
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
      activeNodeId: targetId,
      offset: 0,
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

    // STEP 13.1.4 — Handle focus/zoom
    let newActiveNodeId = editorState.activeNodeId;
    let newFocusRootId = focusRootId;

    // If deleted node was active, move focus
    if (editorState.activeNodeId === nodeId) {
      newActiveNodeId =
        nextFocusId ?? editorState.nodes[0]?.id ?? editorState.activeNodeId;
    }

    // If we're zoomed into the deleted node, zoom out
    if (focusRootId === nodeId) {
      newFocusRootId = nodeToDelete.parentId;
    }

    // STEP 14.2 — Commit deletion
    commit({
      nodes: updatedNodes,
      activeNodeId: newActiveNodeId,
      offset: 0,
      focusRootId: newFocusRootId,
      selection: { anchor: null, focus: null },
    });
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
          activeNodeId: action.nodeId,
          offset: 0,
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
            activeNodeId: firstVisibleNode?.id ?? '',
            offset: 0,
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
    setFocusRootId(editorState.activeNodeId);
    setSelection({ anchor: null, focus: null });
    setEditorState({
      ...editorState,
      offset: 0,
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
        activeNodeId: focusRootId,
        offset: 0,
      });
    }
  }

  /**
   * STEP 8.4 — Navigate through visible nodes only
   */
  function navigateVisibleUp(state: EditorState): EditorState {
    const visibleNodes = getVisibleNodes(state.nodes);
    const index = visibleNodes.findIndex((n) => n.id === state.activeNodeId);

    if (index <= 0) return state; // Already at top

    const prevNode = visibleNodes[index - 1];
    if (!prevNode) return state;

    return {
      ...state,
      activeNodeId: prevNode.id,
      offset: Math.min(state.offset, prevNode.text.length),
    };
  }

  function navigateVisibleDown(state: EditorState): EditorState {
    const visibleNodes = getVisibleNodes(state.nodes);
    const index = visibleNodes.findIndex((n) => n.id === state.activeNodeId);

    if (index === -1 || index >= visibleNodes.length - 1) return state; // Already at bottom

    const nextNode = visibleNodes[index + 1];
    if (!nextNode) return state;

    return {
      ...state,
      activeNodeId: nextNode.id,
      offset: Math.min(state.offset, nextNode.text.length),
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

      const newText =
        node.text.slice(0, start.offset) + node.text.slice(end.offset);

      return {
        ...state,
        nodes: nodes.map((n) =>
          n.id === node.id ? { ...n, text: newText } : n
        ),
        activeNodeId: node.id,
        offset: start.offset,
      };
    }

    // multi-node selection
    const startIndex = nodes.findIndex((n) => n.id === start.nodeId);
    const endIndex = nodes.findIndex((n) => n.id === end.nodeId);

    const startNode = nodes[startIndex];
    const endNode = nodes[endIndex];

    if (!startNode || !endNode) return state;

    const mergedText =
      startNode.text.slice(0, start.offset) + endNode.text.slice(end.offset);

    let newNodes = nodes.slice(0, startIndex + 1);
    newNodes[startIndex] = { ...startNode, text: mergedText };
    newNodes = newNodes.concat(nodes.slice(endIndex + 1));

    return {
      nodes: newNodes,
      activeNodeId: startNode.id,
      offset: start.offset,
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
   * Phase 5.1.5 — Editor → Browser Caret Sync
   * DISABLED per Phase 5.1 directive:
   * - Browser owns caret
   * - Forcing selection causes flicker and breaks drag selection
   * - This will be reintroduced LATER in controlled cases
   */
  // useEffect(() => {
  //   const activeNode = editorState.nodes.find(
  //     (n) => n.id === editorState.activeNodeId
  //   );
  //   if (!activeNode) return;
  //
  //   // Find the node__content element
  //   const nodeElement = document.querySelector(
  //     `[data-node-id="${editorState.activeNodeId}"] .node__content`
  //   );
  //   if (!nodeElement) return;
  //
  //   const textNode = nodeElement.firstChild;
  //   if (!textNode) return;
  //
  //   const range = document.createRange();
  //   const sel = window.getSelection();
  //   if (!sel) return;
  //
  //   try {
  //     const clampedOffset = Math.max(
  //       0,
  //       Math.min(editorState.offset, activeNode.text.length)
  //     );
  //     range.setStart(textNode, clampedOffset);
  //     range.collapse(true);
  //     sel.removeAllRanges();
  //     sel.addRange(range);
  //   } catch (err) {
  //     // Ignore - cursor position may be invalid during rapid updates
  //   }
  // }, [editorState.activeNodeId, editorState.offset]);

  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent) => {
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

      // Space - commit grammar (for some grammar types)
      if (e.key === ' ' && grammarSession.grammar?.type === 'slash') {
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
              (n) => n.id === editorState.activeNodeId
            );
            if (activeNode) {
              // Extract command name from candidate
              const commandName =
                (candidate.params.keyword as string) ||
                candidate.commandType.split('.')[1] ||
                'command';

              const { from } = grammarSession.range;
              const newText =
                activeNode.text.slice(0, from) +
                '/' +
                commandName +
                ' ' +
                activeNode.text.slice(grammarSession.range.to);

              const updatedNodes = editorState.nodes.map((n) =>
                n.id === activeNode.id ? { ...n, text: newText } : n
              );

              setEditorState({
                ...editorState,
                nodes: updatedNodes,
                offset: from + commandName.length + 2, // After "/" + command + " "
              });

              // Clear grammar - will re-detect on next keystroke
              setGrammarSession(EMPTY_GRAMMAR_SESSION);
            }
          }
        }
        return;
      }
    }

    // STEP 14.3 — Undo (Cmd/Ctrl + Z)
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    // STEP 14.3 — Redo (Cmd/Ctrl + Shift + Z)
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      redo();
      return;
    }

    // STEP 16.2 — Save View (Cmd/Ctrl + Shift + S)
    if (e.key === 's' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      setShowSaveViewDialog(true);
      setSaveViewName('');
      return;
    }

    // STEP 17.3 — Open Template Picker (Cmd/Ctrl + Shift + T)
    if (e.key === 't' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      setShowTemplatePicker(true);
      setTemplatePickerIndex(0);
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
      deleteNode(editorState.activeNodeId);
      return;
    }

    // STEP 11.2.1 — Open Reference Picker (Cmd/Ctrl + Shift + R)
    if (e.key === 'r' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      setRefPickerState({
        isOpen: true,
        sourceNodeId: editorState.activeNodeId,
        selectedIndex: 0,
      });
      return;
    }

    // STEP 9.3 — Zoom In (Cmd/Ctrl + Enter)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      zoomIn();
      return;
    }

    // STEP 15.3 — Open Query Bar (/)
    if (e.key === '/' && !showQueryBar) {
      e.preventDefault();
      setShowQueryBar(true);
      setQueryInput('');
      return;
    }

    // STEP 9.4 — Zoom Out (Escape) / Close Query Bar
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showQueryBar) {
        setShowQueryBar(false);
        setQuery(null);
        setQueryInput('');
      } else {
        zoomOut();
      }
      return;
    }

    // STEP 6.4 — Handle Tab/Shift+Tab for indent/outdent
    if (e.key === 'Tab') {
      e.preventDefault();

      if (e.shiftKey) {
        // Outdent
        const newState = outdentNode(editorState);
        // STEP 14.2 — Commit outdent
        commit({
          nodes: newState.nodes as UINode[],
          activeNodeId: newState.activeNodeId,
          offset: newState.offset,
          selection: { anchor: null, focus: null },
        });
      } else {
        // Indent
        const newState = indentNode(editorState);
        // STEP 14.2 — Commit indent
        commit({
          nodes: newState.nodes as UINode[],
          activeNodeId: newState.activeNodeId,
          offset: newState.offset,
          selection: { anchor: null, focus: null },
        });
      }
      return;
    }

    // Handle ArrowLeft (UI-only, no intent)
    if (e.key === 'ArrowLeft') {
      e.preventDefault();

      // STEP 8.3 — Collapse at offset 0 (if has children and not selecting)
      if (editorState.offset === 0 && !e.shiftKey) {
        const activeNode = editorState.nodes.find(
          (n) => n.id === editorState.activeNodeId
        ) as UINode;
        if (
          activeNode &&
          hasChildren(activeNode, editorState.nodes) &&
          !activeNode.isCollapsed
        ) {
          const newState = collapseNode(editorState);
          // STEP 14.2 — Commit collapse
          commit({
            nodes: newState.nodes as UINode[],
            activeNodeId: newState.activeNodeId,
            offset: newState.offset,
            selection: { anchor: null, focus: null },
          });
          return;
        }
      }

      // If shift is pressed, we're selecting
      if (e.shiftKey) {
        // Initialize anchor if no selection exists
        if (!selection.anchor) {
          setSelection({
            anchor: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
            focus: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
          });
        }

        // Move focus left
        if (editorState.offset > 0) {
          const newState = { ...editorState, offset: editorState.offset - 1 };
          setEditorState(newState);
          setSelection((sel) => ({
            ...sel,
            focus: { nodeId: newState.activeNodeId, offset: newState.offset },
          }));
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index > 0) {
            const prevNode = editorState.nodes[index - 1];
            if (prevNode) {
              const newState = {
                ...editorState,
                activeNodeId: prevNode.id,
                offset: prevNode.text.length,
              };
              setEditorState(newState);
              setSelection((sel) => ({
                ...sel,
                focus: {
                  nodeId: newState.activeNodeId,
                  offset: newState.offset,
                },
              }));
            }
          }
        }
      } else {
        // Clear selection and move cursor
        setSelection({ anchor: null, focus: null });

        if (editorState.offset > 0) {
          setEditorState({ ...editorState, offset: editorState.offset - 1 });
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index > 0) {
            const prevNode = editorState.nodes[index - 1];
            if (prevNode) {
              setEditorState({
                ...editorState,
                activeNodeId: prevNode.id,
                offset: prevNode.text.length,
              });
            }
          }
        }
      }
      return;
    }

    // Handle ArrowRight (UI-only, no intent)
    if (e.key === 'ArrowRight') {
      e.preventDefault();

      const activeNode = editorState.nodes.find(
        (n) => n.id === editorState.activeNodeId
      ) as UINode;
      if (!activeNode) return;

      // STEP 8.3 — Expand at offset 0 (if collapsed and not selecting)
      if (editorState.offset === 0 && !e.shiftKey) {
        if (activeNode.isCollapsed) {
          const newState = expandNode(editorState);
          // STEP 14.2 — Commit expand
          commit({
            nodes: newState.nodes as UINode[],
            activeNodeId: newState.activeNodeId,
            offset: newState.offset,
            selection: { anchor: null, focus: null },
          });
          return;
        }
      }

      // If shift is pressed, we're selecting
      if (e.shiftKey) {
        // Initialize anchor if no selection exists
        if (!selection.anchor) {
          setSelection({
            anchor: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
            focus: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
          });
        }

        // Move focus right
        if (editorState.offset < activeNode.text.length) {
          const newState = { ...editorState, offset: editorState.offset + 1 };
          setEditorState(newState);
          setSelection((sel) => ({
            ...sel,
            focus: { nodeId: newState.activeNodeId, offset: newState.offset },
          }));
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index < editorState.nodes.length - 1) {
            const nextNode = editorState.nodes[index + 1];
            if (nextNode) {
              const newState = {
                ...editorState,
                activeNodeId: nextNode.id,
                offset: 0,
              };
              setEditorState(newState);
              setSelection((sel) => ({
                ...sel,
                focus: {
                  nodeId: newState.activeNodeId,
                  offset: newState.offset,
                },
              }));
            }
          }
        }
      } else {
        // Clear selection and move cursor
        setSelection({ anchor: null, focus: null });

        if (editorState.offset < activeNode.text.length) {
          setEditorState({ ...editorState, offset: editorState.offset + 1 });
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index < editorState.nodes.length - 1) {
            const nextNode = editorState.nodes[index + 1];
            if (nextNode) {
              setEditorState({
                ...editorState,
                activeNodeId: nextNode.id,
                offset: 0,
              });
            }
          }
        }
      }
      return;
    }

    // Handle ArrowUp/ArrowDown with shift for selection (STEP 8.4 — visibility-aware)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();

      if (e.shiftKey) {
        // Initialize anchor if no selection exists
        if (!selection.anchor) {
          setSelection({
            anchor: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
            focus: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
          });
        }

        // Move focus through visible nodes only
        const newState =
          e.key === 'ArrowUp'
            ? navigateVisibleUp(editorState)
            : navigateVisibleDown(editorState);
        setEditorState(newState);
        setSelection((sel) => ({
          ...sel,
          focus: { nodeId: newState.activeNodeId, offset: newState.offset },
        }));
      } else {
        // Clear selection and move cursor through visible nodes only
        setSelection({ anchor: null, focus: null });
        const newState =
          e.key === 'ArrowUp'
            ? navigateVisibleUp(editorState)
            : navigateVisibleDown(editorState);
        setEditorState(newState);
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

    // STEP 4.3 / 10.3 — Typing With Selection / Property Trigger
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();

      if (selectionExists) {
        const normalized = normalizeSelection(
          selection.anchor,
          selection.focus,
          editorState.nodes
        );
        if (normalized) {
          let nextState = deleteSelection(editorState, normalized);
          nextState = applyIntent(nextState, {
            type: 'insertText',
            text: e.key,
          });
          // STEP 14.2 — Commit text edit after selection delete
          commit({
            nodes: nextState.nodes as UINode[],
            activeNodeId: nextState.activeNodeId,
            offset: nextState.offset,
            selection: { anchor: null, focus: null },
          });
          return;
        }
      }

      // PHASE 5.2.1 — Markdown Shortcut: Task Variant ([]␣)
      // Authority: File 07 (LOCKED)
      if (
        e.key === ' ' &&
        editorState.offset === 2 &&
        !isSessionActive(grammarSession)
      ) {
        const activeNode = editorState.nodes.find(
          (n) => n.id === editorState.activeNodeId
        );
        if (activeNode && activeNode.text === '[]') {
          const updatedNodes = editorState.nodes.map((n) =>
            n.id === activeNode.id
              ? {
                  ...n,
                  text: '',
                  props: { ...n.props, variant: 'task' },
                }
              : n
          );

          commit({
            nodes: updatedNodes as UINode[],
            activeNodeId: activeNode.id,
            offset: 0,
            selection: { anchor: null, focus: null },
          });

          return;
        }
      }

      // STEP 10.3 — Property trigger: `:` at start of empty node
      if (e.key === ':' && editorState.offset === 0) {
        const activeNode = editorState.nodes.find(
          (n) => n.id === editorState.activeNodeId
        );
        if (activeNode && activeNode.text === '') {
          setEditingProperty({
            nodeId: activeNode.id,
            key: '',
            value: '',
            isNewProperty: true,
          });
          return;
        }
      }

      // No selection - normal insert
      const newState = applyIntent(editorState, {
        type: 'insertText',
        text: e.key,
      });
      // STEP 14.2 — Commit text insert
      commit({
        nodes: newState.nodes as UINode[],
        activeNodeId: newState.activeNodeId,
        offset: newState.offset,
      });

      // PHASE C — Detect grammar after text insertion
      const activeNode = newState.nodes.find(
        (n) => n.id === newState.activeNodeId
      );
      if (activeNode) {
        updateGrammarDetection(activeNode.text, newState.offset);
      }

      return;
    }

    // STEP 4.4 / 7.4 — Backspace With Selection / Hierarchy-aware Backspace
    if (e.key === 'Backspace') {
      e.preventDefault();

      if (selectionExists) {
        const normalized = normalizeSelection(
          selection.anchor,
          selection.focus,
          editorState.nodes
        );
        if (normalized) {
          const nextState = deleteSelection(editorState, normalized);
          setSelection({ anchor: null, focus: null });
          setEditorState(nextState);
          return;
        }
      }

      // File 03 — Backspace behavior (delete/merge only, never outdent)
      const newState = applyIntent(editorState, { type: 'backspace' });
      // STEP 14.2 — Commit backspace
      commit({
        nodes: newState.nodes as UINode[],
        activeNodeId: newState.activeNodeId,
        offset: newState.offset,
      });
      return;
    }

    // STEP 4.5 / 7.2 — Enter With Selection / Hierarchy-aware Enter
    if (e.key === 'Enter') {
      e.preventDefault();

      if (selectionExists) {
        const normalized = normalizeSelection(
          selection.anchor,
          selection.focus,
          editorState.nodes
        );
        if (normalized) {
          let nextState = deleteSelection(editorState, normalized);
          nextState = applyIntent(nextState, { type: 'enter' });
          // STEP 14.2 — Commit enter after selection delete
          commit({
            nodes: nextState.nodes as UINode[],
            activeNodeId: nextState.activeNodeId,
            offset: nextState.offset,
            selection: { anchor: null, focus: null },
          });
          return;
        }
      }

      const activeNode = editorState.nodes.find(
        (n) => n.id === editorState.activeNodeId
      );
      if (!activeNode) return;

      // Cursor at START of non-empty node → create sibling ABOVE
      if (editorState.offset === 0 && activeNode.text.length > 0) {
        const newState = createSiblingAbove(editorState);
        // STEP 14.2 — Commit create sibling above
        commit({
          nodes: newState.nodes as UINode[],
          activeNodeId: newState.activeNodeId,
          offset: newState.offset,
        });
        return;
      }

      // All other cases (empty, middle, end) → delegate to applyIntent
      const newState = applyIntent(editorState, { type: 'enter' });
      // STEP 14.2 — Commit enter
      commit({
        nodes: newState.nodes as UINode[],
        activeNodeId: newState.activeNodeId,
        offset: newState.offset,
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
              isActive={node.id === editorState.activeNodeId}
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
                      setEditingProperty(null);
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
                      setEditingProperty(null);
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
            Active: {editorState.activeNodeId} @ offset {editorState.offset}
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
                    applyTemplate(editorState.activeNodeId, template);
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
                      applyTemplate(editorState.activeNodeId, template);
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
