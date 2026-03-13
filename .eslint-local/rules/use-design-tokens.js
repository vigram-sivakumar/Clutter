/**
 * ESLint Rule: use-design-tokens
 *
 * Enforces use of design tokens instead of hardcoded values
 *
 * @fileoverview Prevents hardcoded colors, spacing, typography, and sizing values
 * that should come from the centralized token system.
 *
 * ❌ BAD:
 * <div style={{ color: '#131210', padding: 8 }} />
 * const styles = { backgroundColor: 'rgb(250, 250, 248)' };
 *
 * ✅ GOOD:
 * <div style={{ color: colors[theme.mode].text.default, padding: spacing['8'] }} />
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded design values (colors, spacing, typography). Use design tokens instead.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      hardcodedColor:
        'Avoid hardcoded color "{{value}}". Use tokens from @clutter/ui/tokens/colors or @clutter/editor/tokens instead.',
      hardcodedSpacing:
        'Avoid magic number {{value}} for spacing/sizing. Use tokens from @clutter/editor/tokens (spacing, sizing) instead.',
      hardcodedZIndex:
        'Avoid hardcoded z-index {{value}}. Use sizing.zIndex.* from @clutter/editor/tokens instead.',
      hardcodedFontSize:
        'Avoid hardcoded fontSize {{value}}. Use typography.* from @clutter/editor/tokens instead.',
    },
    schema: [], // No options
  },

  create(context) {
    // Hex color pattern: #fff, #FFFFFF, #f0f0f0
    const hexColorPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;

    // RGB/RGBA pattern: rgb(...), rgba(...)
    const rgbPattern = /rgba?\s*\(/;

    // Common spacing/sizing property names that should use tokens
    const spacingProps = new Set([
      'padding',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'margin',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft',
      'gap',
      'rowGap',
      'columnGap',
      'width',
      'height',
      'minWidth',
      'minHeight',
      'maxWidth',
      'maxHeight',
      'top',
      'right',
      'bottom',
      'left',
      'borderRadius',
    ]);

    const colorProps = new Set([
      'color',
      'backgroundColor',
      'borderColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'background',
      'fill',
      'stroke',
    ]);

    /**
     * Check if node has an exception comment
     */
    function isWhitelisted(node) {
      const sourceCode = context.getSourceCode();
      const comments = sourceCode.getCommentsBefore(node);
      return comments.some(
        (comment) =>
          comment.value.includes('eslint-disable-next-line') &&
          comment.value.includes('use-design-tokens')
      );
    }

    /**
     * Check if a string value contains a color
     */
    function containsColor(value) {
      if (typeof value !== 'string') return false;
      return hexColorPattern.test(value) || rgbPattern.test(value);
    }

    /**
     * Check if a property value is a magic number that should use tokens
     */
    function isMagicNumber(propName, value) {
      // Only check numeric literals or string numbers (e.g., '8px')
      if (typeof value === 'number') {
        return true;
      }
      if (typeof value === 'string') {
        // Check for patterns like '8px', '16px', etc.
        const numericValue = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
        return numericValue !== null;
      }
      return false;
    }

    /**
     * Report a violation for a style property
     */
    function checkStyleProperty(propNode, propName, valueNode) {
      // Skip if whitelisted
      if (isWhitelisted(propNode)) return;

      const value = valueNode.value;

      // Check for hardcoded colors
      if (colorProps.has(propName)) {
        if (containsColor(value)) {
          context.report({
            node: valueNode,
            messageId: 'hardcodedColor',
            data: { value },
          });
        }
      }

      // Check for z-index
      if (propName === 'zIndex' && typeof value === 'number') {
        context.report({
          node: valueNode,
          messageId: 'hardcodedZIndex',
          data: { value: value.toString() },
        });
      }

      // Check for fontSize
      if (propName === 'fontSize' && isMagicNumber(propName, value)) {
        context.report({
          node: valueNode,
          messageId: 'hardcodedFontSize',
          data: { value: value.toString() },
        });
      }

      // Check for spacing/sizing magic numbers
      if (spacingProps.has(propName) && isMagicNumber(propName, value)) {
        context.report({
          node: valueNode,
          messageId: 'hardcodedSpacing',
          data: { value: value.toString() },
        });
      }
    }

    return {
      /**
       * Check JSX style prop: <div style={{ color: '#fff' }} />
       */
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        if (!node.value || node.value.type !== 'JSXExpressionContainer') return;

        const expr = node.value.expression;
        if (expr.type !== 'ObjectExpression') return;

        // Check each property in the style object
        expr.properties.forEach((prop) => {
          if (prop.type !== 'Property') return;

          const propName = prop.key.name || prop.key.value;
          const valueNode = prop.value;

          // Only check Literal values (strings, numbers)
          if (valueNode.type === 'Literal') {
            checkStyleProperty(prop, propName, valueNode);
          }
        });
      },

      /**
       * Check object literal style objects: const styles = { color: '#fff' }
       */
      ObjectExpression(node) {
        // Look for style-like object assignments
        const parent = node.parent;

        // Check if this looks like a style object (has style-related properties)
        const hasStyleProps = node.properties.some((prop) => {
          if (prop.type !== 'Property') return false;
          const propName = prop.key.name || prop.key.value;
          return colorProps.has(propName) || spacingProps.has(propName);
        });

        if (!hasStyleProps) return;

        // Check each property
        node.properties.forEach((prop) => {
          if (prop.type !== 'Property') return;

          const propName = prop.key.name || prop.key.value;
          const valueNode = prop.value;

          // Only check Literal values (strings, numbers)
          if (valueNode.type === 'Literal') {
            checkStyleProperty(prop, propName, valueNode);
          }
        });
      },

      /**
       * Check template literals that might contain colors
       */
      TemplateLiteral(node) {
        // Skip if whitelisted
        if (isWhitelisted(node)) return;

        // Check if this is in a style context
        const parent = node.parent;
        if (!parent || parent.type !== 'Property') return;

        const propName = parent.key.name || parent.key.value;
        if (!colorProps.has(propName)) return;

        // Check each quasi (string part) of the template
        node.quasis.forEach((quasi) => {
          const value = quasi.value.raw;
          if (containsColor(value)) {
            context.report({
              node: quasi,
              messageId: 'hardcodedColor',
              data: { value },
            });
          }
        });
      },
    };
  },
};
