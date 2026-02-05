/**
 * PHASE B — HASHTAG PARSER
 *
 * Parses #hashtags into structured grammar.
 *
 * Hashtags = Properties. Always. No other meaning.
 *
 * Examples:
 * - #status → { key: 'status', value: null }
 * - #status done → { key: 'status', value: 'done' }
 * - #priority high → { key: 'priority', value: 'high' }
 */

import type { HashtagGrammar, TextRange } from './grammarTypes';

/**
 * Parse hashtag from text
 *
 * Formats:
 * - #key → property with no value (tag)
 * - #key value → property with value
 * - #key:value → property with value (colon syntax)
 */
export function parseHashtag(
  word: string,
  range: TextRange
): HashtagGrammar | null {
  // Must start with #
  if (!word.startsWith('#')) {
    return null;
  }

  // Remove leading #
  const content = word.slice(1).trim();

  // Empty hashtag
  if (!content) {
    return null;
  }

  // Try colon syntax first: #key:value
  const colonMatch = content.match(/^([a-zA-Z0-9_-]+):(.+)$/);
  if (colonMatch) {
    const [_, key, value] = colonMatch;
    return {
      type: 'hashtag',
      key: normalizePropertyKey(key!),
      value: value!.trim(),
      range,
      raw: word,
    };
  }

  // Try space syntax: #key value
  const spaceMatch = content.match(/^([a-zA-Z0-9_-]+)\s+(.+)$/);
  if (spaceMatch) {
    const [_, key, value] = spaceMatch;
    return {
      type: 'hashtag',
      key: normalizePropertyKey(key!),
      value: value!.trim(),
      range,
      raw: word,
    };
  }

  // Just key, no value: #key
  const keyOnlyMatch = content.match(/^([a-zA-Z0-9_-]+)$/);
  if (keyOnlyMatch) {
    const [_, key] = keyOnlyMatch;
    return {
      type: 'hashtag',
      key: normalizePropertyKey(key!),
      value: null,
      range,
      raw: word,
    };
  }

  // Invalid format
  return null;
}

/**
 * Normalize property key
 *
 * Rules:
 * - Lowercase
 * - Trim whitespace
 * - Replace spaces with hyphens
 * - Remove special characters (except hyphen, underscore)
 */
export function normalizePropertyKey(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

/**
 * Known property keys
 *
 * Common properties that might have autocomplete.
 */
export const KNOWN_PROPERTY_KEYS = [
  'status',
  'priority',
  'due',
  'tags',
  'type',
  'category',
  'project',
  'assignee',
  'done',
  'todo',
  'archived',
] as const;

/**
 * Known property values by key
 *
 * Predefined values for specific keys.
 * Used for autocomplete and validation.
 */
export const KNOWN_PROPERTY_VALUES: Record<string, string[]> = {
  status: ['todo', 'doing', 'done', 'blocked', 'cancelled'],
  priority: ['low', 'medium', 'high', 'urgent'],
  type: ['task', 'note', 'meeting', 'idea', 'reference'],
  category: ['work', 'personal', 'learning', 'project'],
};

/**
 * Get hashtag suggestions
 *
 * Returns possible completions for partial hashtag.
 * Used for autocomplete.
 */
export function getHashtagSuggestions(
  partial: string,
  existingProperties?: Array<{ key: string; value: string }>
): Array<{
  key: string;
  value?: string;
  display: string;
}> {
  const suggestions: Array<{
    key: string;
    value?: string;
    display: string;
  }> = [];

  const lower = partial.toLowerCase();

  // Check if partial includes value separator
  const colonIndex = partial.indexOf(':');
  const spaceIndex = partial.indexOf(' ');
  const hasSeparator = colonIndex !== -1 || spaceIndex !== -1;

  if (hasSeparator) {
    // Suggesting values for a key
    const separatorIndex = colonIndex !== -1 ? colonIndex : spaceIndex;
    const key = partial.slice(0, separatorIndex).toLowerCase();
    const valuePartial = partial.slice(separatorIndex + 1).toLowerCase();

    const knownValues = KNOWN_PROPERTY_VALUES[key] || [];

    for (const value of knownValues) {
      if (value.startsWith(valuePartial)) {
        suggestions.push({
          key,
          value,
          display: `${key}:${value}`,
        });
      }
    }

    // Also suggest values from existing properties with same key
    if (existingProperties) {
      const existingValues = existingProperties
        .filter((p) => p.key === key)
        .map((p) => p.value);

      for (const value of existingValues) {
        if (
          value.toLowerCase().startsWith(valuePartial) &&
          !suggestions.find((s) => s.value === value)
        ) {
          suggestions.push({
            key,
            value,
            display: `${key}:${value}`,
          });
        }
      }
    }
  } else {
    // Suggesting keys
    for (const key of KNOWN_PROPERTY_KEYS) {
      if (key.startsWith(lower)) {
        suggestions.push({
          key,
          display: key,
        });
      }
    }

    // Also suggest keys from existing properties
    if (existingProperties) {
      const existingKeys = Array.from(
        new Set(existingProperties.map((p) => p.key))
      );

      for (const key of existingKeys) {
        if (key.startsWith(lower) && !suggestions.find((s) => s.key === key)) {
          suggestions.push({
            key,
            display: key,
          });
        }
      }
    }
  }

  return suggestions;
}

/**
 * Validate hashtag key
 *
 * Checks if key is valid format.
 */
export function isValidPropertyKey(key: string): boolean {
  return /^[a-z0-9_-]+$/.test(key) && key.length > 0;
}

/**
 * Parse multiple hashtags from text
 *
 * Finds all hashtags in a piece of text.
 * Returns array of hashtag grammars with their positions.
 */
export function parseAllHashtags(text: string): HashtagGrammar[] {
  const hashtags: HashtagGrammar[] = [];
  const regex = /#[a-zA-Z0-9_-]+(?:[:]\s*[^\s#]+|\s+[^\s#]+)?/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const word = match[0]!;
    const range: TextRange = {
      from: match.index,
      to: match.index + word.length,
    };

    const grammar = parseHashtag(word, range);
    if (grammar) {
      hashtags.push(grammar);
    }
  }

  return hashtags;
}
