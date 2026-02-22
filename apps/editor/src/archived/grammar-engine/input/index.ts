/**
 * PHASE B — INPUT GRAMMAR & DISPATCH
 *
 * Clean exports for input grammar system.
 */

// Types
export type {
  Grammar,
  GrammarDetection,
  GrammarContext,
  IntentResolution,
  IntentCandidate,
  SlashGrammar,
  MentionGrammar,
  HashtagGrammar,
  NodeMention,
  DateMention,
  DocumentMention,
  PlainTextGrammar,
  TextRange,
  ParsedDate,
} from './grammarTypes';

// Detection
export {
  detectGrammar,
  findWordAtCursor,
  shouldCancelGrammar,
  isGrammarTrigger,
  extractGrammarPrefix,
} from './detectGrammar';

// Parsers
export {
  parseSlash,
  isKnownSlashCommand,
  getSlashSuggestions,
  getSlashCommandMeta,
  validateSlashCommand,
  getCommandsByCategory,
  getHighFrequencyCommands,
  filterCommands,
  getCategoryLabel,
  SLASH_COMMANDS,
  SLASH_COMMAND_REGISTRY,
} from './parseSlash';
export type { CommandCategory, SlashCommandMeta } from './parseSlash';

export {
  parseMention,
  parseAsDate,
  parseAsExternalReference,
  isLikelyDocumentReference,
  getMentionSuggestions,
  isEmailPattern,
} from './parseMention';

export {
  parseHashtag,
  normalizePropertyKey,
  getHashtagSuggestions,
  isValidPropertyKey,
  parseAllHashtags,
  KNOWN_PROPERTY_KEYS,
  KNOWN_PROPERTY_VALUES,
} from './parseHashtag';

// PHASE 3C: Hashtag sync
export {
  syncPropertiesFromText,
  extractPropertiesFromText,
  hasHashtags,
  getPropertyKeysFromText,
  isPropertyInText,
  validateHashtagSync,
} from './hashtagSync';
export type { HashtagSyncResult } from './hashtagSync';

// Intent resolution
export {
  resolveIntent,
  selectBestCandidate,
  filterCandidatesByType,
  hasAmbiguity,
} from './resolveIntent';

// Command conversion
export {
  intentToCommand,
  resolutionToCommands,
  getBestCommand,
  grammarToCommand,
} from './grammarToCommand';
