/**
 * PHASE C + 3A — GRAMMAR CHOOSER UI
 *
 * Context-aware slash menu with categories.
 * Tana-style short list, not global palette.
 */

import type { GrammarSession } from './grammarSession';

export function GrammarChooser({
  session,
  onSelect,
  onCancel,
}: {
  session: GrammarSession;
  onSelect: (index: number) => void;
  onCancel: () => void;
}) {
  if (!session.grammar || session.candidates.length === 0) {
    return null;
  }

  // PHASE 3A: Filter to high-confidence candidates only (hide low confidence)
  const highConfidenceCandidates = session.candidates.filter(
    (c) => c.confidence === 'high' || c.confidence === 'medium'
  );

  // If no high-confidence, show all
  const displayCandidates =
    highConfidenceCandidates.length > 0
      ? highConfidenceCandidates
      : session.candidates;

  // Group by category
  const isSlashCommand = session.grammar.type === 'slash';
  const isMention = session.grammar.type === 'mention';
  let groupedCandidates: Array<{
    category: string | null;
    candidates: Array<{
      candidate: (typeof session.candidates)[0];
      originalIndex: number;
    }>;
  }> = [];

  if (isSlashCommand) {
    // Group slash commands by command category
    const categoryMap = new Map<
      string,
      Array<{
        candidate: (typeof session.candidates)[0];
        originalIndex: number;
      }>
    >();

    displayCandidates.forEach((candidate, idx) => {
      const originalIndex = session.candidates.indexOf(candidate);
      const category = getCategoryFromCommandType(candidate.commandType);

      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push({ candidate, originalIndex });
    });

    // Convert to array and sort by category order
    const categoryOrder = [
      'Structure',
      'Property',
      'Template',
      'Document',
      'System',
    ];
    groupedCandidates = Array.from(categoryMap.entries())
      .sort((a, b) => {
        const aIndex = categoryOrder.indexOf(a[0]);
        const bIndex = categoryOrder.indexOf(b[0]);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      })
      .map(([category, candidates]) => ({ category, candidates }));
  } else if (isMention) {
    // PHASE 3B: Group mentions by entity type (Nodes, Dates, Documents)
    const categoryMap = new Map<
      string,
      Array<{
        candidate: (typeof session.candidates)[0];
        originalIndex: number;
      }>
    >();

    displayCandidates.forEach((candidate, idx) => {
      const originalIndex = session.candidates.indexOf(candidate);
      const category = getMentionCategory(
        candidate.commandType,
        candidate.params
      );

      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push({ candidate, originalIndex });
    });

    // Convert to array and sort by category order (Nodes, Dates, Documents)
    const categoryOrder = ['Nodes', 'Dates', 'Documents'];
    groupedCandidates = Array.from(categoryMap.entries())
      .sort((a, b) => {
        const aIndex = categoryOrder.indexOf(a[0]);
        const bIndex = categoryOrder.indexOf(b[0]);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      })
      .map(([category, candidates]) => ({ category, candidates }));
  } else {
    // No grouping for other grammar types
    groupedCandidates = [
      {
        category: null,
        candidates: displayCandidates.map((candidate, idx) => ({
          candidate,
          originalIndex: session.candidates.indexOf(candidate),
        })),
      },
    ];
  }

  return (
    <div
      style={{
        position: 'fixed',
        backgroundColor: '#1e1e1e',
        border: '1px solid #4fc3f7',
        borderRadius: '4px',
        padding: '4px',
        minWidth: '240px',
        maxWidth: '400px',
        zIndex: 10000,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '10px',
          color: '#888',
          padding: '4px 8px',
          borderBottom: '1px solid #3e3e3e',
          marginBottom: '4px',
        }}
      >
        {getGrammarTypeLabel(session.grammar.type)} • ↑↓ • ↵ space • esc
      </div>

      {/* Candidates grouped by category */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {groupedCandidates.map((group, groupIdx) => (
          <div key={groupIdx}>
            {/* Category header (for slash commands and mentions) */}
            {group.category && (isSlashCommand || isMention) && (
              <div
                style={{
                  fontSize: '9px',
                  color: '#666',
                  padding: '4px 8px',
                  marginTop: groupIdx > 0 ? '8px' : '0',
                  textTransform: 'uppercase',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                }}
              >
                {group.category}
              </div>
            )}

            {/* Candidates in this group */}
            {group.candidates.map(({ candidate, originalIndex }) => {
              const isSelected = originalIndex === session.selectedIndex;

              return (
                <div
                  key={originalIndex}
                  onClick={() => onSelect(originalIndex)}
                  onMouseEnter={() => onSelect(originalIndex)}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: isSelected ? '#37373d' : 'transparent',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    marginBottom: '1px',
                  }}
                >
                  {/* Command name and category (compact row) */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        color: isSelected ? '#d4d4d4' : '#aaa',
                        fontWeight: isSelected ? 'bold' : 'normal',
                      }}
                    >
                      {getCommandLabel(candidate.commandType)}
                    </span>
                    {!isSlashCommand && (
                      <span
                        style={{
                          fontSize: '9px',
                          color: '#666',
                          marginLeft: '8px',
                        }}
                      >
                        {getCategoryFromCommandType(candidate.commandType)}
                      </span>
                    )}
                  </div>

                  {/* Description (1 line max) */}
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#666',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {candidate.reason}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Get human-readable label for grammar type
 */
function getGrammarTypeLabel(type: string): string {
  switch (type) {
    case 'slash':
      return 'Slash command';
    case 'mention':
      return 'Mention';
    case 'hashtag':
      return 'Property';
    case 'reference':
      return 'Reference';
    case 'text':
      return 'Text';
    default:
      return 'Grammar';
  }
}

/**
 * Get human-readable label for command type
 */
function getCommandLabel(commandType: string): string {
  const labels: Record<string, string> = {
    'node.insertText': 'Insert text',
    'node.deleteText': 'Delete text',
    'node.replaceText': 'Replace text',
    'node.create': 'Create node',
    'node.delete': 'Delete node',
    'node.indent': 'Indent',
    'node.outdent': 'Outdent',
    'node.move': 'Move node',
    'ref.add': 'Add reference',
    'ref.remove': 'Remove reference',
    'reference.insert': 'Insert reference',
    'prop.set': 'Set property',
    'prop.remove': 'Remove property',
    'template.apply': 'Apply template',
    'document.create': 'New document',
    'document.rename': 'Rename document',
    'document.delete': 'Delete document',
    'document.switch': 'Switch document',
    'system.saveNow': 'Save now',
    'system.bindLocation': 'Choose location',
    'system.retrySave': 'Retry save',
  };

  return labels[commandType] || commandType;
}

/**
 * Get color for confidence level
 */
function getConfidenceColor(confidence: string): string {
  switch (confidence) {
    case 'high':
      return '#6a9955';
    case 'medium':
      return '#dcdcaa';
    case 'low':
      return '#f48771';
    default:
      return '#888';
  }
}

/**
 * PHASE 3A — Get category from command type (for slash commands)
 */
function getCategoryFromCommandType(commandType: string): string {
  // Map command types to categories
  if (commandType.startsWith('node.')) {
    return 'Structure';
  }
  if (commandType.startsWith('prop.')) {
    return 'Property';
  }
  if (commandType.startsWith('template.')) {
    return 'Template';
  }
  if (commandType.startsWith('document.')) {
    return 'Document';
  }
  if (commandType.startsWith('ref.')) {
    return 'Reference';
  }
  if (commandType.startsWith('system.')) {
    return 'System';
  }
  return 'Other';
}

/**
 * PHASE 3B — Get category from mention (for @mentions)
 */
function getMentionCategory(
  commandType: string,
  params: Record<string, unknown>
): string {
  // For mentions, categorize by entity type
  if (commandType === 'ref.add') {
    return 'Nodes';
  }
  if (commandType === 'prop.set' && params.key === 'due') {
    return 'Dates';
  }
  if (commandType === 'document.switch') {
    return 'Documents';
  }
  return 'Other';
}
