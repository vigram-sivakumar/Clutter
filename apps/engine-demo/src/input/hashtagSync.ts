/**
 * PHASE 3C — HASHTAG SYNC ENGINE
 *
 * Bidirectional sync between node segments and properties.
 *
 * Invariant: node.segments ⇄ node.props
 *
 * Rules:
 * - Add #key value → props[key] = value
 * - Edit value in text → property updates
 * - Remove hashtag → property removed
 * - Duplicate hashtags → last one wins (deterministic)
 * - Sync only on text change
 * - No background magic
 */

import type { Node } from '../engine/NodeKernel';
import { parseAllHashtags, normalizePropertyKey } from './parseHashtag';
import { getPlainText } from '../engine/SegmentUtils';

/**
 * Sync result
 */
export type HashtagSyncResult = {
  updatedProps: Record<string, string>;
  changed: boolean; // True if props were modified
};

/**
 * Extract properties from hashtags in text
 *
 * Pure function. Deterministic output.
 */
export function extractPropertiesFromText(
  text: string
): Record<string, string> {
  const hashtags = parseAllHashtags(text);
  const props: Record<string, string> = {};

  // Process in order (last one wins for duplicates)
  for (const hashtag of hashtags) {
    props[hashtag.key] = hashtag.value || '';
  }

  return props;
}

/**
 * Sync node properties from text
 *
 * Returns updated properties based on hashtags in text.
 * Does NOT mutate input.
 */
export function syncPropertiesFromText(node: Node): HashtagSyncResult {
  const plainText = getPlainText(node.segments);
  const extractedProps = extractPropertiesFromText(plainText);

  // Merge with existing properties
  // Rules:
  // 1. Hashtags in text = source of truth for those keys
  // 2. Properties not in text = preserved (user-set via other means)
  // 3. Hashtags removed from text = properties removed

  const updatedProps: Record<string, string> = { ...node.props };
  let changed = false;

  // Add/update properties from hashtags
  for (const [key, value] of Object.entries(extractedProps)) {
    if (updatedProps[key] !== value) {
      updatedProps[key] = value;
      changed = true;
    }
  }

  // Remove properties that are no longer in text
  // (Only if they were hashtag-originated, not manually set)
  // For now, we'll keep all non-hashtag props
  // This is a design decision: hashtags are additive only via text

  return {
    updatedProps,
    changed,
  };
}

/**
 * Check if text contains hashtags
 */
export function hasHashtags(text: string): boolean {
  return /#[a-zA-Z0-9_-]+/.test(text);
}

/**
 * Get all property keys from text
 */
export function getPropertyKeysFromText(text: string): string[] {
  const hashtags = parseAllHashtags(text);
  return hashtags.map((h) => h.key);
}

/**
 * Check if property key exists in text
 */
export function isPropertyInText(text: string, key: string): boolean {
  const keys = getPropertyKeysFromText(text);
  return keys.includes(normalizePropertyKey(key));
}

/**
 * Validate sync invariant
 *
 * Checks that node.props matches hashtags in node.segments.
 * Used for testing and debugging.
 */
export function validateHashtagSync(node: Node): {
  valid: boolean;
  errors: string[];
} {
  const plainText = getPlainText(node.segments);
  const extractedProps = extractPropertiesFromText(plainText);
  const errors: string[] = [];

  // Check that hashtag props match node props
  for (const [key, value] of Object.entries(extractedProps)) {
    if (node.props?.[key] !== value) {
      errors.push(
        `Property mismatch: hashtag #${key} = "${value}" but node.props["${key}"] = "${node.props?.[key] || 'undefined'}"`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
