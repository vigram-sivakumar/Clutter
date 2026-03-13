/**
 * Custom ESLint Rules for Clutter Editor
 *
 * These rules enforce architectural contracts that can't be
 * expressed through TypeScript types alone.
 */

module.exports = {
  'require-ui-safety-wrapper': require('./require-ui-safety-wrapper'),
  'no-manual-block-create': require('./no-manual-block-create'),
};
