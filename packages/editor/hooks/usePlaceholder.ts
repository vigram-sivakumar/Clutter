/**
 * usePlaceholder Hook - Structural Placeholder Text
 *
 * Returns placeholder text for empty blocks. Does NOT determine visibility.
 *
 * ARCHITECTURE:
 * - This hook is purely structural (data layer)
 * - Returns text if block is empty, null otherwise
 * - NO selection logic, NO focus detection
 * - Visibility is controlled by CSS + .block-focused class
 * - Focus class is managed imperatively via DOM in useBlock
 *
 * PLACEHOLDER RULES (Apple Notes / Notion / Craft Pattern):
 * 1. RULE 1: Empty editor → always show in first block
 * 2. RULE 2: Non-empty editor → only show in focused empty block
 * 3. RULE 3: Never show multiple placeholders (only one at a time)
 * 4. RULE 4: Placeholder follows caret, not hover
 *
 * Rules 2-4 are enforced by CSS visibility, not this hook.
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import { placeholders } from '../tokens';

interface UsePlaceholderProps {
  node: PMNode;
  customText?: string; // Optional custom placeholder text
}

/**
 * Returns placeholder text if this block is empty, null otherwise
 *
 * @param node - The ProseMirror node
 * @param customText - Optional custom placeholder text (e.g., "Type or paste code...")
 * @returns Placeholder text or null
 */
export function usePlaceholder({
  node,
  customText,
}: UsePlaceholderProps): string | null {
  // Single responsibility: check if empty, return text
  const isEmpty = node.content.size === 0;

  if (!isEmpty) return null;

  // Return placeholder text for ALL empty blocks
  // CSS will decide which one is visible based on .block-focused class
  return customText || placeholders.default;
}
