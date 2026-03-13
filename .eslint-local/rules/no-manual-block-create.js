/**
 * ESLint Rule: no-manual-block-create
 *
 * Enforces use of createBlockNode() instead of manual schema.nodes.X.create() calls
 *
 * @fileoverview Prevents direct .create() calls on ProseMirror schema nodes,
 * which can bypass blockId assignment and create identity leaks.
 *
 * ❌ BAD:
 * state.schema.nodes.paragraph.create({ indent: 0 })
 * schema.nodes['heading'].create({ headingLevel: 2 })
 *
 * ✅ GOOD:
 * createBlockNode(schema, { type: 'paragraph', indent: 0 })
 * createCleanBlockAttrs(node, indent) // for cloning
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow manual .create() calls on schema nodes (use createBlockNode instead)',
      category: 'Possible Errors',
      recommended: true,
    },
    messages: {
      noManualCreate:
        'Do not use manual .create() on schema nodes. Use createBlockNode() or createCleanBlockAttrs() instead to ensure blockId is assigned.',
    },
    schema: [], // No options
  },

  create(context) {
    /**
     * Check if a node is accessing schema.nodes.X or schema.nodes['X']
     */
    function isSchemaNodesAccess(node) {
      if (!node || !node.object) return false;

      // Check for: schema.nodes.X or state.schema.nodes.X
      if (
        node.object.type === 'MemberExpression' &&
        node.object.property &&
        node.object.property.name === 'nodes'
      ) {
        const schemaNode = node.object.object;
        if (schemaNode.type === 'Identifier' && schemaNode.name === 'schema') {
          return true;
        }
        if (
          schemaNode.type === 'MemberExpression' &&
          schemaNode.property &&
          schemaNode.property.name === 'schema'
        ) {
          return true;
        }
      }

      return false;
    }

    /**
     * Check if this is a whitelisted exception
     */
    function isWhitelisted(node, sourceCode) {
      // Check for exception comment above the line
      const comments = sourceCode.getCommentsBefore(node);
      return comments.some(
        (comment) =>
          comment.value.includes('eslint-disable-next-line') &&
          comment.value.includes('no-manual-block-create')
      );
    }

    return {
      /**
       * Detect: schema.nodes.X.create(...)
       * or: schema.nodes['X'].create(...)
       */
      CallExpression(node) {
        const { callee } = node;

        // Must be a member expression (something.create)
        if (callee.type !== 'MemberExpression') return;

        // Must be calling .create()
        if (!callee.property || callee.property.name !== 'create') return;

        // Check if it's on schema.nodes.X
        if (isSchemaNodesAccess(callee.object)) {
          const sourceCode = context.getSourceCode();

          // Allow exceptions with eslint-disable comment
          if (isWhitelisted(node, sourceCode)) return;

          context.report({
            node,
            messageId: 'noManualCreate',
          });
        }
      },
    };
  },
};
