/**
 * PHASE B — INPUT GRAMMAR TYPES
 *
 * Structured representations of user input patterns.
 *
 * Grammar objects are pure data. They describe intent, not action.
 * They never mutate state. They never execute commands.
 */

/**
 * Text range in document
 */
export type TextRange = {
  from: number;
  to: number;
};

/**
 * GRAMMAR 1: SLASH COMMANDS
 *
 * Explicit structural or system actions.
 * Highest priority after selection.
 *
 * Examples:
 * - /todo
 * - /template Task
 * - /delete
 * - /new document
 */
export type SlashGrammar = {
  type: 'slash';
  keyword: string; // 'todo', 'template', 'delete'
  args: string[]; // Additional arguments
  range: TextRange; // Where in text
  raw: string; // Original input
};

/**
 * GRAMMAR 2: AT-MENTIONS
 *
 * Entity references or smart values.
 * Three subtypes with different semantics.
 */

/**
 * Node mention - reference to another node
 */
export type NodeMention = {
  type: 'mention';
  subtype: 'node';
  identifier: string; // 'Project Alpha', 'node-123'
  isExternal: boolean; // Cross-workspace reference
  externalPath?: {
    workspaceId: string;
    documentId: string;
  };
  range: TextRange;
  raw: string;
};

/**
 * Date mention - temporal reference
 */
export type DateMention = {
  type: 'mention';
  subtype: 'date';
  value: string; // ISO date string
  originalFormat: string; // 'today', '2026-03-01', 'tomorrow'
  range: TextRange;
  raw: string;
};

/**
 * Document mention - navigation target
 */
export type DocumentMention = {
  type: 'mention';
  subtype: 'document';
  identifier: string; // 'Inbox', 'Project Notes'
  range: TextRange;
  raw: string;
};

export type MentionGrammar = NodeMention | DateMention | DocumentMention;

/**
 * GRAMMAR 3: HASHTAGS
 *
 * Properties. Always. No other meaning.
 *
 * Examples:
 * - #status
 * - #status done
 * - #priority high
 */
export type HashtagGrammar = {
  type: 'hashtag';
  key: string; // Property key (normalized)
  value: string | null; // Property value (null = tag only)
  range: TextRange;
  raw: string;
};

/**
 * GRAMMAR 4: PLAIN TEXT
 *
 * Fallback. Just insert text.
 */
export type PlainTextGrammar = {
  type: 'text';
  content: string;
  range: TextRange;
};

/**
 * Unified grammar type
 */
export type Grammar =
  | SlashGrammar
  | MentionGrammar
  | HashtagGrammar
  | PlainTextGrammar;

/**
 * Grammar detection result
 *
 * Indicates which grammar (if any) is active at cursor.
 */
export type GrammarDetection =
  | {
      active: true;
      grammar: Grammar;
    }
  | {
      active: false;
      reason: string;
    };

/**
 * Intent resolution result
 *
 * Maps grammar to possible commands.
 * May have multiple candidates if ambiguous.
 */
export type IntentResolution = {
  grammar: Grammar;
  candidates: IntentCandidate[];
};

/**
 * Intent candidate
 *
 * One possible interpretation of grammar.
 */
export type IntentCandidate = {
  commandType: string; // e.g., 'ref.add', 'prop.set'
  confidence: 'high' | 'medium' | 'low';
  reason: string; // Why this interpretation
  params: Record<string, unknown>; // Command payload data
};

/**
 * Grammar context
 *
 * Additional information needed to resolve grammar.
 */
export type GrammarContext = {
  nodeId: string; // Current node
  cursorOffset: number; // Cursor position in text
  selectionRange?: TextRange; // If text is selected
  documentId: string; // Current document
  workspaceId: string; // Current workspace
  // PHASE 3B: Entity lookups for mention resolution
  availableNodes?: Array<{ id: string; label: string }>;
  availableDocuments?: Array<{ id: string; name: string }>;
  // PHASE 3C: Property suggestions for hashtags
  allProperties?: Array<{ key: string; value: string }>;
};

/**
 * Date parsing result
 */
export type ParsedDate = {
  isoDate: string; // YYYY-MM-DD
  originalFormat: string; // What user typed
  isRelative: boolean; // true for 'today', 'tomorrow'
};
