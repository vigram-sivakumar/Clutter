/**
 * EditorDocument - Canonical Editor Contract
 * 
 * This is the editor's truth. TipTap JSON wrapped with versioning.
 * 
 * CRITICAL RULES:
 * - EditorDocument IS TipTap JSON (wrapped, not reinvented)
 * - Editor never sees domain objects (Note, Folder, Tag)
 * - Adapters translate at app boundary
 * - Migrations are app-owned
 * 
 * This file is constitutional law for the editor package.
 */

/**
 * EditorDocument - The editor's canonical document format
 * 
 * Wraps TipTap JSON with versioning for:
 * - Schema migrations
 * - Future metadata
 * - Editor independence from app state
 */
export interface EditorDocument {
  /** Schema version for migrations */
  version: number;
  
  /** The actual TipTap document content */
  content: TipTapJSON;
}

/**
 * TipTap JSON root structure
 */
export type TipTapJSON = {
  type: 'doc';
  content: TipTapNode[];
};

/**
 * TipTap node structure
 * 
 * Represents any block or inline node in the editor.
 * Block IDs live in attrs.id and must be stable.
 */
export type TipTapNode = {
  /** Node type (paragraph, heading, listBlock, etc.) */
  type: string;
  
  /** Node attributes - includes stable block ID */
  attrs?: {
    /** Stable block identifier - never regenerated */
    id?: string;
    [key: string]: any;
  };
  
  /** Child nodes (for block containers) */
  content?: TipTapNode[];
  
  /** Text formatting marks */
  marks?: TipTapMark[];
  
  /** Text content (for text nodes) */
  text?: string;
};

/**
 * TipTap mark structure
 * 
 * Represents inline formatting (bold, italic, links, etc.)
 */
export type TipTapMark = {
  /** Mark type (bold, italic, link, tag, etc.) */
  type: string;
  
  /** Mark attributes (e.g., href for links, tagId for tags) */
  attrs?: {
    [key: string]: any;
  };
};

/**
 * Serialized format for storage
 * 
 * This is what gets stored in app state.
 * Identical to EditorDocument but semantically distinct.
 */
export type SerializedEditorDocument = {
  version: number;
  content: TipTapJSON;
};

