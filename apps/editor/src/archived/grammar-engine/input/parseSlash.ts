/**
 * PHASE B — SLASH COMMAND PARSER
 *
 * Parses slash commands into structured grammar.
 *
 * Examples:
 * - /todo → { keyword: 'todo', args: [] }
 * - /template Task → { keyword: 'template', args: ['Task'] }
 * - /new document → { keyword: 'new', args: ['document'] }
 */

import type { SlashGrammar, TextRange } from './grammarTypes';

/**
 * Known slash commands
 *
 * This is the canonical list. Adding new commands happens here.
 */
export const SLASH_COMMANDS = [
  // Node operations
  'todo',
  'heading',
  'paragraph',
  'code',
  'quote',
  'divider',

  // Structure
  'indent',
  'outdent',
  'move',
  'delete',
  'create',

  // Templates
  'template',

  // Document
  'new',
  'rename',
  'switch',

  // System
  'save',
  'export',
  'import',

  // Properties
  'tag',
  'prop',
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];

/**
 * Parse slash command from text
 *
 * Input: "/template Task" (without leading slash already removed)
 * Output: { keyword: 'template', args: ['Task'] }
 */
export function parseSlash(
  word: string,
  range: TextRange
): SlashGrammar | null {
  // Must start with /
  if (!word.startsWith('/')) {
    return null;
  }

  // Remove leading /
  const content = word.slice(1).trim();

  // Empty slash
  if (!content) {
    return {
      type: 'slash',
      keyword: '',
      args: [],
      range,
      raw: word,
    };
  }

  // Split into keyword and args
  const parts = content.split(/\s+/);
  const keyword = parts[0]!.toLowerCase();
  const args = parts.slice(1);

  return {
    type: 'slash',
    keyword,
    args,
    range,
    raw: word,
  };
}

/**
 * Check if keyword is a known slash command
 */
export function isKnownSlashCommand(keyword: string): boolean {
  return SLASH_COMMANDS.includes(keyword as SlashCommand);
}

/**
 * Get slash command suggestions
 *
 * Returns commands that match the partial input.
 * Used for autocomplete.
 */
export function getSlashSuggestions(partial: string): SlashCommand[] {
  const lower = partial.toLowerCase();

  return SLASH_COMMANDS.filter((cmd) => cmd.startsWith(lower));
}

/**
 * PHASE 3A — Command categories
 */
export type CommandCategory =
  | 'structure'
  | 'property'
  | 'template'
  | 'document'
  | 'system';

/**
 * Slash command metadata
 *
 * Describes what each command does and what args it expects.
 */
export type SlashCommandMeta = {
  command: string;
  category: CommandCategory;
  description: string;
  aliases?: string[]; // Alternative names for filtering
  frequency: 'high' | 'medium' | 'low'; // For default ordering
  args?: {
    name: string;
    required: boolean;
    description: string;
  }[];
  examples: string[];
  requiresContext?: 'hasParent' | 'hasSibling' | 'hasChildren' | 'isRoot';
};

/**
 * PHASE 3A — Slash command registry
 *
 * Full metadata for all commands.
 * Organized by category and frequency.
 */
export const SLASH_COMMAND_REGISTRY: Record<string, SlashCommandMeta> = {
  // STRUCTURE COMMANDS
  create: {
    command: 'create',
    category: 'structure',
    description: 'Create new child node',
    frequency: 'high',
    aliases: ['child', 'new'],
    examples: ['/create'],
  },
  delete: {
    command: 'delete',
    category: 'structure',
    description: 'Delete current node',
    frequency: 'high',
    aliases: ['remove'],
    examples: ['/delete'],
  },
  indent: {
    command: 'indent',
    category: 'structure',
    description: 'Indent node (make child of previous sibling)',
    frequency: 'high',
    requiresContext: 'hasSibling',
    examples: ['/indent'],
  },
  outdent: {
    command: 'outdent',
    category: 'structure',
    description: 'Outdent node (promote to parent level)',
    frequency: 'high',
    requiresContext: 'hasParent',
    examples: ['/outdent'],
  },

  // PROPERTY COMMANDS
  todo: {
    command: 'todo',
    category: 'property',
    description: 'Set status = todo',
    frequency: 'high',
    aliases: ['task'],
    examples: ['/todo'],
  },
  tag: {
    command: 'tag',
    category: 'property',
    description: 'Add property tag',
    frequency: 'medium',
    aliases: ['prop', 'property'],
    args: [
      {
        name: 'key',
        required: true,
        description: 'Property key',
      },
      {
        name: 'value',
        required: false,
        description: 'Property value',
      },
    ],
    examples: ['/tag status', '/tag status done'],
  },

  // TEMPLATE COMMANDS
  template: {
    command: 'template',
    category: 'template',
    description: 'Apply template to this node',
    frequency: 'high',
    args: [
      {
        name: 'template-name',
        required: true,
        description: 'Name of template to apply',
      },
    ],
    examples: ['/template Task', '/template Meeting'],
  },

  // DOCUMENT COMMANDS
  new: {
    command: 'new',
    category: 'document',
    description: 'Create new document',
    frequency: 'medium',
    aliases: ['document'],
    args: [
      {
        name: 'document-name',
        required: false,
        description: 'Name for new document',
      },
    ],
    examples: ['/new', '/new Project Notes'],
  },

  // SYSTEM COMMANDS
  save: {
    command: 'save',
    category: 'system',
    description: 'Save workspace now',
    frequency: 'medium',
    examples: ['/save'],
  },

  // LEGACY (keep for compatibility)
  heading: {
    command: 'heading',
    category: 'property',
    description: 'Convert node to heading',
    frequency: 'low',
    examples: ['/heading'],
  },
  paragraph: {
    command: 'paragraph',
    category: 'property',
    description: 'Convert node to paragraph',
    frequency: 'low',
    examples: ['/paragraph'],
  },
};

/**
 * Get command metadata
 */
export function getSlashCommandMeta(keyword: string): SlashCommandMeta | null {
  return SLASH_COMMAND_REGISTRY[keyword] || null;
}

/**
 * Validate slash command arguments
 *
 * Checks if command has required args.
 */
export function validateSlashCommand(grammar: SlashGrammar): {
  valid: boolean;
  error?: string;
} {
  const meta = getSlashCommandMeta(grammar.keyword);

  if (!meta) {
    return {
      valid: false,
      error: `Unknown command: ${grammar.keyword}`,
    };
  }

  // Check required args
  const requiredArgs = meta.args?.filter((a) => a.required) || [];

  if (grammar.args.length < requiredArgs.length) {
    return {
      valid: false,
      error: `Missing required arguments: ${requiredArgs.map((a) => a.name).join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * PHASE 3A — Get commands by category
 */
export function getCommandsByCategory(): Record<
  CommandCategory,
  SlashCommandMeta[]
> {
  const categorized: Record<CommandCategory, SlashCommandMeta[]> = {
    structure: [],
    property: [],
    template: [],
    document: [],
    system: [],
  };

  for (const meta of Object.values(SLASH_COMMAND_REGISTRY)) {
    categorized[meta.category].push(meta);
  }

  // Sort each category by frequency
  const frequencyOrder = { high: 0, medium: 1, low: 2 };
  for (const category of Object.keys(categorized) as CommandCategory[]) {
    categorized[category].sort(
      (a, b) => frequencyOrder[a.frequency] - frequencyOrder[b.frequency]
    );
  }

  return categorized;
}

/**
 * PHASE 3A — Get high-frequency commands only
 */
export function getHighFrequencyCommands(): SlashCommandMeta[] {
  return Object.values(SLASH_COMMAND_REGISTRY)
    .filter((cmd) => cmd.frequency === 'high')
    .sort((a, b) => {
      // Sort by category first, then alphabetically
      if (a.category !== b.category) {
        const categoryOrder: CommandCategory[] = [
          'structure',
          'property',
          'template',
          'document',
          'system',
        ];
        return (
          categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
        );
      }
      return a.command.localeCompare(b.command);
    });
}

/**
 * PHASE 3A — Filter commands by query with alias support
 */
export function filterCommands(
  query: string,
  includeAllFrequencies: boolean = false
): SlashCommandMeta[] {
  const lower = query.toLowerCase();

  let commands = Object.values(SLASH_COMMAND_REGISTRY);

  // If no query, show only high frequency
  if (!lower && !includeAllFrequencies) {
    return getHighFrequencyCommands();
  }

  // Filter by command name or alias
  if (lower) {
    commands = commands.filter((cmd) => {
      const matchesCommand = cmd.command.toLowerCase().includes(lower);
      const matchesAlias = cmd.aliases?.some((alias) =>
        alias.toLowerCase().includes(lower)
      );
      return matchesCommand || matchesAlias;
    });
  }

  // Sort by relevance (starts with > contains)
  commands.sort((a, b) => {
    const aStarts = a.command.toLowerCase().startsWith(lower);
    const bStarts = b.command.toLowerCase().startsWith(lower);

    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    // Then by frequency
    const frequencyOrder = { high: 0, medium: 1, low: 2 };
    return frequencyOrder[a.frequency] - frequencyOrder[b.frequency];
  });

  return commands;
}

/**
 * PHASE 3A — Get category display name
 */
export function getCategoryLabel(category: CommandCategory): string {
  const labels: Record<CommandCategory, string> = {
    structure: 'Structure',
    property: 'Property',
    template: 'Template',
    document: 'Document',
    system: 'System',
  };
  return labels[category];
}
