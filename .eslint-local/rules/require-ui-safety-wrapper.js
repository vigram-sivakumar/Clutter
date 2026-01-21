/**
 * ESLint Rule: require-ui-safety-wrapper
 *
 * Enforces that all keyboard handlers in /keyboard/keymaps/ are wrapped
 * with withUISafety() to ensure UI intent precedence.
 *
 * ✅ Valid:
 *   export const handleEnter = withUISafety(handleEnterImpl, 'handleEnter');
 *
 * ❌ Invalid:
 *   export function handleEnter(editor: Editor): boolean { ... }
 *
 * Escape hatch (use sparingly):
 *   // eslint-disable-next-line keyboard/require-ui-safety-wrapper
 *   export function handleSpecialCase(editor: Editor): boolean { ... }
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce withUISafety wrapper for keyboard handlers in keymaps/',
      category: 'Architecture',
      recommended: true,
    },
    messages: {
      missingWrapper:
        'Keyboard handler "{{name}}" must be wrapped with withUISafety(). ' +
        'See packages/editor/plugins/keyboard/ARCHITECTURE.md for details.',
      directExport:
        'Keyboard handler "{{name}}" should not be exported as a function declaration. ' +
        "Use: export const {{name}} = withUISafety({{name}}Impl, '{{name}}');",
    },
    schema: [], // no options
  },

  create(context) {
    const filename = context.getFilename();

    // Only enforce in /keyboard/keymaps/ directory
    if (!filename.includes('/keyboard/keymaps/')) {
      return {};
    }

    return {
      // Check exported function declarations
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;

        // Case 1: export function handleXyz() { ... }
        if (
          declaration &&
          declaration.type === 'FunctionDeclaration' &&
          declaration.id &&
          declaration.id.name.startsWith('handle')
        ) {
          context.report({
            node: declaration.id,
            messageId: 'directExport',
            data: {
              name: declaration.id.name,
            },
          });
        }

        // Case 2: export const handleXyz = function() { ... } (without wrapper)
        if (declaration && declaration.type === 'VariableDeclaration') {
          for (const declarator of declaration.declarations) {
            if (
              declarator.id &&
              declarator.id.name &&
              declarator.id.name.startsWith('handle')
            ) {
              // Check if it's wrapped with withUISafety
              const init = declarator.init;

              // Valid: withUISafety(...)
              const isWrapped =
                init &&
                init.type === 'CallExpression' &&
                init.callee &&
                init.callee.name === 'withUISafety';

              if (!isWrapped) {
                context.report({
                  node: declarator.id,
                  messageId: 'missingWrapper',
                  data: {
                    name: declarator.id.name,
                  },
                });
              }
            }
          }
        }
      },
    };
  },
};
