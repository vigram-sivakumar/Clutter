/**
 * PHASE B — INTENT RESOLUTION
 *
 * Maps grammar objects to command candidates.
 *
 * Rules:
 * - If input could map to multiple meanings, emit multiple candidates
 * - Do not guess - be explicit about ambiguity
 * - Return confidence levels
 * - UI decides which candidate to use
 *
 * This is where grammar → command mapping happens.
 */

import type {
  Grammar,
  IntentResolution,
  IntentCandidate,
  GrammarContext,
  SlashGrammar,
  MentionGrammar,
  HashtagGrammar,
} from './grammarTypes';
import { getSlashCommandMeta } from './parseSlash';
import { getMentionSuggestions } from './parseMention';
import { getHashtagSuggestions } from './parseHashtag';

/**
 * Resolve intent from grammar
 *
 * Pure function. No side effects. No lookups.
 * Returns possible command interpretations.
 */
export function resolveIntent(
  grammar: Grammar,
  context: GrammarContext
): IntentResolution {
  switch (grammar.type) {
    case 'slash':
      return resolveSlashIntent(grammar, context);

    case 'mention':
      return resolveMentionIntent(grammar, context);

    case 'hashtag':
      return resolveHashtagIntent(grammar, context);

    case 'text':
      return resolveTextIntent(grammar, context);

    default: {
      const _exhaustive: never = grammar;
      return {
        grammar,
        candidates: [],
      };
    }
  }
}

/**
 * Resolve slash command intent
 * PHASE 3A: Context-aware filtering
 */
function resolveSlashIntent(
  grammar: SlashGrammar,
  context: GrammarContext
): IntentResolution {
  const { keyword, args } = grammar;
  const candidates: IntentCandidate[] = [];

  // PHASE 3A: Check command metadata for context requirements
  const meta = getSlashCommandMeta(keyword);

  // For now, we'll add all commands but could filter based on context
  // Context filtering would require node information (hasParent, hasSibling, etc.)
  // This can be enhanced when we pass more context

  switch (keyword) {
    case 'todo':
      candidates.push({
        commandType: 'prop.set',
        confidence: 'high',
        reason: 'Set status = todo',
        params: {
          nodeId: context.nodeId,
          key: 'type',
          value: 'todo',
        },
      });
      break;

    case 'template':
      if (args.length > 0) {
        candidates.push({
          commandType: 'template.apply',
          confidence: 'high',
          reason: 'Apply template',
          params: {
            nodeId: context.nodeId,
            templateName: args.join(' '),
          },
        });
      } else {
        candidates.push({
          commandType: 'template.apply',
          confidence: 'low',
          reason: 'Template name required',
          params: {
            nodeId: context.nodeId,
            templateName: '',
          },
        });
      }
      break;

    case 'delete':
      candidates.push({
        commandType: 'node.delete',
        confidence: 'high',
        reason: 'Delete current node',
        params: {
          nodeId: context.nodeId,
        },
      });
      break;

    case 'indent':
      candidates.push({
        commandType: 'node.indent',
        confidence: 'high',
        reason: 'Indent node',
        params: {
          nodeId: context.nodeId,
        },
      });
      break;

    case 'outdent':
      candidates.push({
        commandType: 'node.outdent',
        confidence: 'high',
        reason: 'Outdent node',
        params: {
          nodeId: context.nodeId,
        },
      });
      break;

    case 'new':
      candidates.push({
        commandType: 'document.create',
        confidence: 'high',
        reason: 'Create new document',
        params: {
          name: args.length > 0 ? args.join(' ') : undefined,
        },
      });
      break;

    case 'save':
      candidates.push({
        commandType: 'system.saveNow',
        confidence: 'high',
        reason: 'Save workspace',
        params: {},
      });
      break;

    case 'heading':
      candidates.push({
        commandType: 'prop.set',
        confidence: 'high',
        reason: 'Convert to heading',
        params: {
          nodeId: context.nodeId,
          key: 'type',
          value: 'heading',
        },
      });
      break;

    case 'create':
      candidates.push({
        commandType: 'node.create',
        confidence: 'high',
        reason: 'Create new child node',
        params: {
          parentId: context.nodeId,
          afterId: null,
          nodeType: 'paragraph',
          text: '',
        },
      });
      break;

    case 'paragraph':
      candidates.push({
        commandType: 'prop.set',
        confidence: 'high',
        reason: 'Convert to paragraph',
        params: {
          nodeId: context.nodeId,
          key: 'type',
          value: 'paragraph',
        },
      });
      break;

    case 'tag':
      // Tag command with args
      if (args.length > 0) {
        const key = args[0]!;
        const value = args.slice(1).join(' ') || '';
        candidates.push({
          commandType: 'prop.set',
          confidence: 'high',
          reason: `Set property ${key}`,
          params: {
            nodeId: context.nodeId,
            key,
            value,
          },
        });
      } else {
        candidates.push({
          commandType: 'prop.set',
          confidence: 'low',
          reason: 'Add property (key required)',
          params: {
            nodeId: context.nodeId,
            key: '',
            value: '',
          },
        });
      }
      break;

    default:
      // Check if it's a known command from metadata
      if (meta) {
        // Generic handler for known commands
        candidates.push({
          commandType: 'unknown',
          confidence: 'medium',
          reason: meta.description,
          params: { keyword, args },
        });
      } else {
        // Unknown command
        candidates.push({
          commandType: 'unknown',
          confidence: 'low',
          reason: `Unknown slash command: ${keyword}`,
          params: { keyword, args },
        });
      }
  }

  return { grammar, candidates };
}

/**
 * Resolve mention intent
 * PHASE 3B: Generate candidates from available entities
 */
function resolveMentionIntent(
  grammar: MentionGrammar,
  context: GrammarContext
): IntentResolution {
  const candidates: IntentCandidate[] = [];

  switch (grammar.subtype) {
    case 'node':
      // If we have a specific node identifier
      if (grammar.identifier) {
        candidates.push({
          commandType: 'ref.add',
          confidence: 'high',
          reason: `Add reference to ${grammar.identifier}`,
          params: {
            fromNodeId: context.nodeId,
            to: grammar.isExternal
              ? {
                  type: 'external',
                  workspaceId: grammar.externalPath!.workspaceId,
                  documentId: grammar.externalPath!.documentId,
                  nodeId: grammar.identifier,
                }
              : {
                  type: 'local',
                  nodeId: grammar.identifier,
                },
            mentionText: grammar.raw,
          },
        });
      } else {
        // PHASE 3B: Generate candidates from available nodes
        const suggestions = getMentionSuggestions(grammar.identifier, {
          availableNodes: context.availableNodes || [],
          availableDocuments: context.availableDocuments || [],
        });

        // Add node candidates
        for (const suggestion of suggestions.filter((s) => s.type === 'node')) {
          candidates.push({
            commandType: 'ref.add',
            confidence: 'high',
            reason: `Reference ${suggestion.display}`,
            params: {
              fromNodeId: context.nodeId,
              to: {
                type: 'local',
                nodeId: suggestion.value,
              },
              mentionText: grammar.raw,
            },
          });
        }
      }
      break;

    case 'date':
      // Date mention = due date property
      candidates.push({
        commandType: 'prop.set',
        confidence: 'high',
        reason: `Set due date: ${grammar.originalFormat}`,
        params: {
          nodeId: context.nodeId,
          key: 'due',
          value: grammar.value,
          mentionText: grammar.raw,
        },
      });
      break;

    case 'document':
      // PHASE 3B: Document mention is ambiguous!

      // Candidate 1: Switch to document
      candidates.push({
        commandType: 'document.switch',
        confidence: 'medium',
        reason: `Switch to ${grammar.identifier}`,
        params: {
          documentId: grammar.identifier,
          mentionText: grammar.raw,
        },
      });

      // Candidate 2: Reference document (as node)
      candidates.push({
        commandType: 'ref.add',
        confidence: 'low',
        reason: `Reference ${grammar.identifier}`,
        params: {
          fromNodeId: context.nodeId,
          to: {
            type: 'local',
            nodeId: grammar.identifier,
          },
          mentionText: grammar.raw,
        },
      });

      break;
  }

  // PHASE 3B: If no specific matches but we have context, generate suggestions
  if (
    candidates.length === 0 &&
    context.availableNodes &&
    context.availableDocuments
  ) {
    const partial =
      grammar.type === 'mention' && 'identifier' in grammar
        ? grammar.identifier
        : '';

    const suggestions = getMentionSuggestions(partial, {
      availableNodes: context.availableNodes,
      availableDocuments: context.availableDocuments,
    });

    // Generate candidates from suggestions
    for (const suggestion of suggestions) {
      if (suggestion.type === 'node') {
        candidates.push({
          commandType: 'ref.add',
          confidence: 'high',
          reason: `Reference ${suggestion.display}`,
          params: {
            fromNodeId: context.nodeId,
            to: {
              type: 'local',
              nodeId: suggestion.value,
            },
            mentionText: '@' + suggestion.display,
          },
        });
      } else if (suggestion.type === 'date') {
        // Date would have been parsed already
        continue;
      } else if (suggestion.type === 'document') {
        candidates.push({
          commandType: 'document.switch',
          confidence: 'medium',
          reason: `Switch to ${suggestion.display}`,
          params: {
            documentId: suggestion.value,
            mentionText: '@' + suggestion.display,
          },
        });
      }
    }
  }

  return { grammar, candidates };
}

/**
 * Resolve hashtag intent
 */
function resolveHashtagIntent(
  grammar: HashtagGrammar,
  context: GrammarContext
): IntentResolution {
  const candidates: IntentCandidate[] = [];

  // PHASE 3C: Generate candidates from hashtag suggestions
  // This provides property key and value suggestions while typing

  // Build partial input for suggestions
  // If grammar has no value yet, suggest keys
  // If grammar has partial value, suggest values
  const partial =
    grammar.value === null ? grammar.key : `${grammar.key} ${grammar.value}`;

  // Get suggestions (keys or values based on partial)
  const suggestions = getHashtagSuggestions(partial, context.allProperties);

  // Generate candidates from suggestions
  for (const suggestion of suggestions) {
    const isComplete = suggestion.value !== undefined;

    candidates.push({
      commandType: 'prop.set',
      confidence: isComplete ? 'high' : 'medium',
      reason: isComplete
        ? `Set ${suggestion.key} = ${suggestion.value}`
        : `Set property ${suggestion.key}`,
      params: {
        nodeId: context.nodeId,
        key: suggestion.key,
        value: suggestion.value || '',
      },
    });
  }

  // If no suggestions, still allow free-text input
  if (candidates.length === 0) {
    if (grammar.value === null) {
      // Key only
      candidates.push({
        commandType: 'prop.set',
        confidence: 'medium',
        reason: `Set property ${grammar.key}`,
        params: {
          nodeId: context.nodeId,
          key: grammar.key,
          value: '',
        },
      });
    } else {
      // Key-value
      candidates.push({
        commandType: 'prop.set',
        confidence: 'high',
        reason: `Set ${grammar.key} = ${grammar.value}`,
        params: {
          nodeId: context.nodeId,
          key: grammar.key,
          value: grammar.value,
        },
      });
    }
  }

  return { grammar, candidates };
}

/**
 * Resolve plain text intent
 */
function resolveTextIntent(
  grammar: {
    type: 'text';
    content: string;
    range: { from: number; to: number };
  },
  context: GrammarContext
): IntentResolution {
  const candidates: IntentCandidate[] = [];

  candidates.push({
    commandType: 'node.insertText',
    confidence: 'high',
    reason: 'Insert text',
    params: {
      nodeId: context.nodeId,
      offset: context.cursorOffset,
      text: grammar.content,
    },
  });

  return { grammar, candidates };
}

/**
 * Select best candidate from resolution
 *
 * Returns highest confidence candidate, or null if none.
 * Used when UI wants automatic selection.
 */
export function selectBestCandidate(
  resolution: IntentResolution
): IntentCandidate | null {
  if (resolution.candidates.length === 0) {
    return null;
  }

  // Sort by confidence
  const sorted = [...resolution.candidates].sort((a, b) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
  });

  return sorted[0] || null;
}

/**
 * Filter candidates by command type
 *
 * Used when UI wants specific command types only.
 */
export function filterCandidatesByType(
  resolution: IntentResolution,
  types: string[]
): IntentCandidate[] {
  return resolution.candidates.filter((c) => types.includes(c.commandType));
}

/**
 * Check if resolution has ambiguity
 *
 * Returns true if multiple high-confidence candidates exist.
 */
export function hasAmbiguity(resolution: IntentResolution): boolean {
  const highConfidence = resolution.candidates.filter(
    (c) => c.confidence === 'high'
  );
  return highConfidence.length > 1;
}
