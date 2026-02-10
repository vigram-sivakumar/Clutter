/**
 * PHASE B — GRAMMAR TO COMMAND CONVERTER
 *
 * Converts intent candidates to actual Command objects.
 *
 * This is the final step in the grammar → command pipeline:
 * Input → Grammar → Intent → Command
 */

import type { Command } from '../commands/types';
import type { IntentCandidate, IntentResolution } from './grammarTypes';

/**
 * Convert intent candidate to command
 *
 * Pure function. Maps intent params to command payload.
 */
export function intentToCommand(candidate: IntentCandidate): Command | null {
  const { commandType, params } = candidate;

  switch (commandType) {
    // ========================================
    // NODE CONTENT COMMANDS
    // ========================================

    case 'node.insertText':
      return {
        type: 'node.insertText',
        payload: {
          nodeId: params.nodeId as string,
          offset: params.offset as number,
          text: params.text as string,
        },
      };

    case 'node.deleteText':
      return {
        type: 'node.deleteText',
        payload: {
          nodeId: params.nodeId as string,
          from: params.from as number,
          to: params.to as number,
        },
      };

    case 'node.replaceText':
      return {
        type: 'node.replaceText',
        payload: {
          nodeId: params.nodeId as string,
          from: params.from as number,
          to: params.to as number,
          text: params.text as string,
        },
      };

    // ========================================
    // STRUCTURE COMMANDS
    // ========================================

    case 'node.create':
      return {
        type: 'node.create',
        payload: {
          parentId: params.parentId as string | null,
          afterId: params.afterId as string | null,
          nodeType: params.nodeType as string | undefined,
          text: params.text as string | undefined,
        },
      };

    case 'node.delete':
      return {
        type: 'node.delete',
        payload: {
          nodeId: params.nodeId as string,
        },
      };

    case 'node.indent':
      return {
        type: 'node.indent',
        payload: {
          nodeId: params.nodeId as string,
        },
      };

    case 'node.outdent':
      return {
        type: 'node.outdent',
        payload: {
          nodeId: params.nodeId as string,
        },
      };

    case 'node.move':
      return {
        type: 'node.move',
        payload: {
          nodeId: params.nodeId as string,
          newParentId: params.newParentId as string | null,
          afterId: params.afterId as string | null,
        },
      };

    // ========================================
    // REFERENCE COMMANDS
    // ========================================

    case 'ref.add':
      return {
        type: 'ref.add',
        payload: {
          fromNodeId: params.fromNodeId as string,
          to: params.to as any, // NodeRef type
        },
      };

    case 'ref.remove':
      return {
        type: 'ref.remove',
        payload: {
          fromNodeId: params.fromNodeId as string,
          to: params.to as any, // NodeRef type
        },
      };

    // ========================================
    // PROPERTY COMMANDS
    // ========================================

    case 'prop.set':
      return {
        type: 'prop.set',
        payload: {
          nodeId: params.nodeId as string,
          key: params.key as string,
          value: params.value as string,
        },
      };

    case 'prop.remove':
      return {
        type: 'prop.remove',
        payload: {
          nodeId: params.nodeId as string,
          key: params.key as string,
        },
      };

    // ========================================
    // TEMPLATE COMMANDS
    // ========================================

    case 'template.apply':
      return {
        type: 'template.apply',
        payload: {
          nodeId: params.nodeId as string,
          templateId: params.templateName as string, // Will need lookup
        },
      };

    // ========================================
    // DOCUMENT COMMANDS
    // ========================================

    case 'document.create':
      return {
        type: 'document.create',
        payload: {
          name: params.name as string | undefined,
        },
      };

    case 'document.rename':
      return {
        type: 'document.rename',
        payload: {
          documentId: params.documentId as string,
          name: params.name as string,
        },
      };

    case 'document.delete':
      return {
        type: 'document.delete',
        payload: {
          documentId: params.documentId as string,
        },
      };

    case 'document.switch':
      return {
        type: 'document.switch',
        payload: {
          documentId: params.documentId as string,
        },
      };

    // ========================================
    // SYSTEM COMMANDS
    // ========================================

    case 'system.saveNow':
      return {
        type: 'system.saveNow',
      };

    case 'system.bindLocation':
      return {
        type: 'system.bindLocation',
      };

    case 'system.retrySave':
      return {
        type: 'system.retrySave',
      };

    // ========================================
    // UNKNOWN/UNSUPPORTED
    // ========================================

    default:
      return null;
  }
}

/**
 * Convert intent resolution to commands
 *
 * Maps all candidates to commands.
 * Filters out null results (unsupported commands).
 */
export function resolutionToCommands(resolution: IntentResolution): Command[] {
  const commands: Command[] = [];

  for (const candidate of resolution.candidates) {
    const command = intentToCommand(candidate);
    if (command) {
      commands.push(command);
    }
  }

  return commands;
}

/**
 * Get best command from resolution
 *
 * Selects highest confidence candidate and converts to command.
 */
export function getBestCommand(resolution: IntentResolution): Command | null {
  if (resolution.candidates.length === 0) {
    return null;
  }

  // Sort by confidence
  const sorted = [...resolution.candidates].sort((a, b) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
  });

  const best = sorted[0];
  return best ? intentToCommand(best) : null;
}

/**
 * Convert grammar directly to command (convenience function)
 *
 * Combines grammar parsing, intent resolution, and command conversion.
 * Returns best command or null.
 */
export function grammarToCommand(
  text: string,
  cursorOffset: number,
  context: {
    nodeId: string;
    documentId: string;
    workspaceId: string;
  }
): Command | null {
  // This would normally use the full pipeline:
  // 1. detectGrammar()
  // 2. resolveIntent()
  // 3. getBestCommand()

  // For now, return null (implementation in Phase C)
  return null;
}
