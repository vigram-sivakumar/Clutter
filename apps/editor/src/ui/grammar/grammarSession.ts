/**
 * PHASE C — GRAMMAR SESSION STATE
 *
 * Transient UI-only state for active grammar detection.
 *
 * NOT persisted. NOT undoable. Just interaction state.
 */

import type { Grammar, IntentCandidate } from '../../input/grammarTypes';

/**
 * Grammar session state
 *
 * Tracks active grammar and command candidates during typing.
 */
export type GrammarSession = {
  // Active grammar (null = no grammar active)
  grammar: Grammar | null;

  // Possible command interpretations
  candidates: IntentCandidate[];

  // Currently selected candidate index
  selectedIndex: number;

  // Original text that triggered grammar
  originalText: string;

  // Range of grammar in text
  range: { from: number; to: number } | null;
};

/**
 * Initial/empty grammar session
 */
export const EMPTY_GRAMMAR_SESSION: GrammarSession = {
  grammar: null,
  candidates: [],
  selectedIndex: 0,
  originalText: '',
  range: null,
};

/**
 * Create grammar session from grammar and resolution
 */
export function createGrammarSession(
  grammar: Grammar,
  candidates: IntentCandidate[],
  originalText: string
): GrammarSession {
  return {
    grammar,
    candidates,
    selectedIndex: 0, // Default to first (highest confidence)
    originalText,
    range: grammar.type === 'text' ? null : grammar.range,
  };
}

/**
 * Get selected candidate from session
 */
export function getSelectedCandidate(
  session: GrammarSession
): IntentCandidate | null {
  if (session.candidates.length === 0) {
    return null;
  }
  return session.candidates[session.selectedIndex] || null;
}

/**
 * Move selection to next candidate
 */
export function selectNextCandidate(session: GrammarSession): GrammarSession {
  if (session.candidates.length <= 1) {
    return session;
  }

  const nextIndex = (session.selectedIndex + 1) % session.candidates.length;

  return {
    ...session,
    selectedIndex: nextIndex,
  };
}

/**
 * Move selection to previous candidate
 */
export function selectPreviousCandidate(
  session: GrammarSession
): GrammarSession {
  if (session.candidates.length <= 1) {
    return session;
  }

  const prevIndex =
    session.selectedIndex === 0
      ? session.candidates.length - 1
      : session.selectedIndex - 1;

  return {
    ...session,
    selectedIndex: prevIndex,
  };
}

/**
 * Check if session is active
 */
export function isSessionActive(session: GrammarSession): boolean {
  return session.grammar !== null && session.candidates.length > 0;
}

/**
 * Check if session has multiple candidates
 */
export function hasMultipleCandidates(session: GrammarSession): boolean {
  return session.candidates.length > 1;
}

/**
 * Should auto-commit (only one high-confidence candidate)
 */
export function shouldAutoCommit(session: GrammarSession): boolean {
  if (session.candidates.length !== 1) {
    return false;
  }

  const candidate = session.candidates[0];
  return candidate ? candidate.confidence === 'high' : false;
}
