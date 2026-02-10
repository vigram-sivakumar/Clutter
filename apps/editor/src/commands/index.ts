/**
 * PHASE A — COMMAND MODEL
 *
 * Clean exports for command system.
 */

export type {
  Command,
  CommandResult,
  CommandMetadata,
  CommandWithMetadata,
  NodeContentCommand,
  StructureCommand,
  ReferenceCommand,
  PropertyCommand,
  TemplateCommand,
  DocumentCommand,
  WorkspaceCommand,
  SystemCommand,
  NodeRef,
} from './types';

export { executeCommand, executeCommandBatch } from './executor';
export type { EditorContext } from './executor';
