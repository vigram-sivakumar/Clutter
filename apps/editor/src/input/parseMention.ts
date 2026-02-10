/**
 * PHASE B — MENTION PARSER
 *
 * Parses @mentions into structured grammar.
 *
 * Three subtypes:
 * 1. Node mention: @Project Alpha
 * 2. Date mention: @today, @2026-03-01
 * 3. Document mention: @Inbox
 *
 * Mentions do NOT mutate directly. They suggest commands.
 */

import type { MentionGrammar, TextRange, ParsedDate } from './grammarTypes';

/**
 * Parse mention from text
 *
 * Determines subtype and extracts relevant data.
 */
export function parseMention(
  word: string,
  range: TextRange
): MentionGrammar | null {
  // Must start with @
  if (!word.startsWith('@')) {
    return null;
  }

  // Remove leading @
  const content = word.slice(1).trim();

  // Empty mention
  if (!content) {
    return null;
  }

  // Try to parse as date first (most specific)
  const dateResult = parseAsDate(content);
  if (dateResult) {
    return {
      type: 'mention',
      subtype: 'date',
      value: dateResult.isoDate,
      originalFormat: dateResult.originalFormat,
      range,
      raw: word,
    };
  }

  // Try to parse as external reference (workspace:doc:node)
  const externalResult = parseAsExternalReference(content);
  if (externalResult) {
    return {
      type: 'mention',
      subtype: 'node',
      identifier: externalResult.nodeId,
      isExternal: true,
      externalPath: {
        workspaceId: externalResult.workspaceId,
        documentId: externalResult.documentId,
      },
      range,
      raw: word,
    };
  }

  // Check if looks like document reference
  if (isLikelyDocumentReference(content)) {
    return {
      type: 'mention',
      subtype: 'document',
      identifier: content,
      range,
      raw: word,
    };
  }

  // Default to node mention
  return {
    type: 'mention',
    subtype: 'node',
    identifier: content,
    isExternal: false,
    range,
    raw: word,
  };
}

/**
 * Try to parse content as a date
 *
 * Supports:
 * - Relative: today, tomorrow, yesterday
 * - ISO: 2026-03-01
 * - Short: 03-01, 3/1
 */
export function parseAsDate(content: string): ParsedDate | null {
  const lower = content.toLowerCase();

  // Relative dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (lower === 'today') {
    return {
      isoDate: toISODate(today),
      originalFormat: 'today',
      isRelative: true,
    };
  }

  if (lower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      isoDate: toISODate(tomorrow),
      originalFormat: 'tomorrow',
      isRelative: true,
    };
  }

  if (lower === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      isoDate: toISODate(yesterday),
      originalFormat: 'yesterday',
      isRelative: true,
    };
  }

  // ISO date: YYYY-MM-DD
  const isoMatch = content.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [_, year, month, day] = isoMatch;
    const date = new Date(
      parseInt(year!),
      parseInt(month!) - 1,
      parseInt(day!)
    );

    if (!isNaN(date.getTime())) {
      return {
        isoDate: content,
        originalFormat: content,
        isRelative: false,
      };
    }
  }

  // Short date: MM-DD or M/D
  const shortMatch = content.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (shortMatch) {
    const [_, month, day] = shortMatch;
    const year = today.getFullYear();
    const date = new Date(year, parseInt(month!) - 1, parseInt(day!));

    if (!isNaN(date.getTime())) {
      return {
        isoDate: toISODate(date),
        originalFormat: content,
        isRelative: false,
      };
    }
  }

  return null;
}

/**
 * Try to parse as external reference
 *
 * Format: workspace:document:node
 * Example: @work:project:TaskNode
 */
export function parseAsExternalReference(content: string): {
  workspaceId: string;
  documentId: string;
  nodeId: string;
} | null {
  const parts = content.split(':');

  if (parts.length !== 3) {
    return null;
  }

  const [workspaceId, documentId, nodeId] = parts;

  if (!workspaceId || !documentId || !nodeId) {
    return null;
  }

  return {
    workspaceId: workspaceId.trim(),
    documentId: documentId.trim(),
    nodeId: nodeId.trim(),
  };
}

/**
 * Check if mention looks like a document reference
 *
 * Heuristics:
 * - Capitalized word
 * - Known document names (Inbox, etc.)
 * - Short (< 3 words)
 */
export function isLikelyDocumentReference(content: string): boolean {
  // Known document names
  const knownDocs = ['inbox', 'archive', 'trash', 'drafts'];
  if (knownDocs.includes(content.toLowerCase())) {
    return true;
  }

  // Single capitalized word
  if (/^[A-Z][a-z]+$/.test(content)) {
    return true;
  }

  // Short phrase (< 3 words)
  const words = content.split(/\s+/);
  if (words.length <= 2 && /^[A-Z]/.test(content)) {
    return true;
  }

  return false;
}

/**
 * Convert Date to ISO string (YYYY-MM-DD)
 */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * PHASE 3B — Get mention suggestions with grouping
 *
 * Returns possible completions for partial mention.
 * Used for autocomplete.
 */
export function getMentionSuggestions(
  partial: string,
  context: {
    availableNodes: Array<{ id: string; label: string }>;
    availableDocuments: Array<{ id: string; name: string }>;
  }
): Array<{
  type: 'node' | 'date' | 'document';
  value: string;
  display: string;
  category: 'Nodes' | 'Dates' | 'Documents';
}> {
  const suggestions: Array<{
    type: 'node' | 'date' | 'document';
    value: string;
    display: string;
    category: 'Nodes' | 'Dates' | 'Documents';
  }> = [];

  const lower = partial.toLowerCase();

  // Date suggestions (always show if empty or matches)
  if (!lower || 'today'.startsWith(lower)) {
    suggestions.push({
      type: 'date',
      value: 'today',
      display: 'Today',
      category: 'Dates',
    });
  }
  if (!lower || 'tomorrow'.startsWith(lower)) {
    suggestions.push({
      type: 'date',
      value: 'tomorrow',
      display: 'Tomorrow',
      category: 'Dates',
    });
  }
  if (!lower || 'yesterday'.startsWith(lower)) {
    suggestions.push({
      type: 'date',
      value: 'yesterday',
      display: 'Yesterday',
      category: 'Dates',
    });
  }

  // Node suggestions
  for (const node of context.availableNodes) {
    if (!lower || node.label.toLowerCase().includes(lower)) {
      suggestions.push({
        type: 'node',
        value: node.id,
        display: node.label,
        category: 'Nodes',
      });
    }
  }

  // Document suggestions
  for (const doc of context.availableDocuments) {
    if (!lower || doc.name.toLowerCase().includes(lower)) {
      suggestions.push({
        type: 'document',
        value: doc.id,
        display: doc.name,
        category: 'Documents',
      });
    }
  }

  // Sort by category (Nodes, Dates, Documents)
  const categoryOrder = { Nodes: 0, Dates: 1, Documents: 2 };
  suggestions.sort(
    (a, b) => categoryOrder[a.category] - categoryOrder[b.category]
  );

  return suggestions;
}

/**
 * PHASE 3B — Check if mention looks like email
 */
export function isEmailPattern(text: string, atIndex: number): boolean {
  // Check if @ is part of email pattern
  // Simple heuristic: text before @ looks like username, after looks like domain
  const before = text.slice(Math.max(0, atIndex - 20), atIndex);
  const after = text.slice(atIndex + 1, Math.min(text.length, atIndex + 30));

  // Has word characters before @
  const hasUsername = /[a-zA-Z0-9._-]+$/.test(before);
  // Has domain-like pattern after @
  const hasDomain = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(after);

  return hasUsername && hasDomain;
}
