/**
 * Field Block Schema
 *
 * Defines the property shape and defaults for Field blocks.
 * A Field is a labeled value block with an optional icon.
 *
 * Future evolution:
 * - v2: valueType (text, number, date, select)
 * - v3: validation rules
 * - v4: computed values / formulas
 */

export interface FieldBlockProperties {
  /** Optional icon (emoji string or icon id) */
  icon?: string;

  /** Label text (single line, editable) */
  label: string;

  /** Value content (Lexical JSON string for now, typed values later) */
  value?: string;
}

/**
 * Default properties when creating a new Field block
 */
export const FIELD_BLOCK_DEFAULTS: FieldBlockProperties = {
  label: 'Label',
  // icon: undefined → shows default Sticker icon in chrome
  // value: undefined → empty Lexical editor
};
