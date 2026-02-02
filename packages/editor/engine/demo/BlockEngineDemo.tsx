/**
 * BlockEngineDemo - Test UI for the block engine with Lexical integration
 *
 * Now features:
 * - Lexical editor per block (plain text)
 * - Enter key splits blocks
 * - Backspace merges blocks
 * - Arrow keys navigate between blocks
 * - Tree structure visualization
 * - Performance metrics
 */

import React, { useState } from 'react';
import { useBlockStore } from '../store';
import { useFocusManager } from '../focus';
import { LexicalBlockEditor } from '../lexical';
import type { BlockType } from '../types';

/**
 * Main demo component
 */
export function BlockEngineDemo() {
  const { rootIds, insertBlock, getAllBlocks, clear } = useBlockStore();
  const [perfMetrics, setPerfMetrics] = useState<string>('');
  const focusManager = useFocusManager();

  const handleAddBlock = () => {
    const lastRootId = rootIds[rootIds.length - 1] || null;
    const newBlockId = insertBlock(lastRootId, 'paragraph');

    // Focus new block
    setTimeout(() => {
      focusManager.focusBlock(newBlockId, 0);
    }, 0);
  };

  const handleClear = () => {
    if (confirm('Clear all blocks?')) {
      clear();
    }
  };

  const handlePerfTest = () => {
    const start = performance.now();
    let lastId: string | null = null;

    // Create 1000 blocks
    for (let i = 0; i < 1000; i++) {
      lastId = insertBlock(lastId, 'paragraph');
    }

    const end = performance.now();
    setPerfMetrics(`Created 1000 blocks in ${(end - start).toFixed(2)}ms`);
  };

  const blockCount = getAllBlocks().length;

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 1200,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          marginBottom: 20,
          borderBottom: '2px solid #e0e0e0',
          paddingBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 12 }}>
          Block Engine + Lexical POC
        </h2>
        <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
          ✅ Enter splits blocks • Backspace merges • Up/Down navigates
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={handleAddBlock}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Add Block
          </button>

          <button
            onClick={handleClear}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Clear All
          </button>

          <button
            onClick={handlePerfTest}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Perf Test (1000 blocks)
          </button>

          <span style={{ color: '#666', fontSize: 14 }}>
            {blockCount} blocks
          </span>

          {perfMetrics && (
            <span style={{ color: '#4CAF50', fontSize: 14, fontWeight: 500 }}>
              {perfMetrics}
            </span>
          )}
        </div>
      </div>

      <div>
        {rootIds.length === 0 ? (
          <div style={{ color: '#999', fontStyle: 'italic', padding: 20 }}>
            No blocks yet. Click "Add Block" to create one.
          </div>
        ) : (
          rootIds.map((id, index) => (
            <BlockNode
              key={id}
              blockId={id}
              depth={0}
              focusManager={focusManager}
              autoFocus={index === 0 && rootIds.length === 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Individual block node (recursive)
 */
function BlockNode({
  blockId,
  depth,
  focusManager,
  autoFocus = false,
}: {
  blockId: string;
  depth: number;
  focusManager: ReturnType<typeof useFocusManager>;
  autoFocus?: boolean;
}) {
  const block = useBlockStore((s) => s.getBlock(blockId));
  const children = useBlockStore((s) => s.getChildren(blockId));
  const updateDescription = useBlockStore((s) => s.updateDescription);
  const deleteBlock = useBlockStore((s) => s.deleteBlock);
  const updateType = useBlockStore((s) => s.updateType);
  const insertBlock = useBlockStore((s) => s.insertBlock);

  const [showDescriptionInput, setShowDescriptionInput] = useState(false);

  if (!block) return null;

  const handleDelete = () => {
    if (confirm(`Delete block "${block.content || '(empty)'}"?`)) {
      deleteBlock(block.id);
    }
  };

  const handleAddChild = () => {
    const newBlockId = insertBlock(block.id, 'paragraph');
    setTimeout(() => {
      focusManager.focusBlock(newBlockId, 0);
    }, 0);
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateType(block.id, e.target.value as BlockType);
  };

  return (
    <div style={{ marginLeft: depth * 24, marginTop: 8 }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          padding: 8,
          backgroundColor: '#f5f5f5',
          borderRadius: 4,
          border: '1px solid #e0e0e0',
        }}
      >
        <select
          value={block.type}
          onChange={handleTypeChange}
          style={{
            padding: '4px 8px',
            border: '1px solid #ccc',
            borderRadius: 4,
            fontSize: 12,
            backgroundColor: 'white',
          }}
        >
          <option value="paragraph">Paragraph</option>
          <option value="heading">Heading</option>
          <option value="list">List</option>
          <option value="code">Code</option>
          <option value="quote">Quote</option>
        </select>

        {/* Lexical Editor */}
        <div
          style={{
            flex: 1,
            border: '1px solid #ccc',
            borderRadius: 4,
            backgroundColor: 'white',
            minHeight: 32,
          }}
        >
          <LexicalBlockEditor
            blockId={block.id}
            focusManager={focusManager}
            autoFocus={autoFocus}
          />
        </div>

        <button
          onClick={() => setShowDescriptionInput(!showDescriptionInput)}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            border: '1px solid #ccc',
            borderRadius: 4,
            backgroundColor: block.description ? '#2196F3' : 'white',
            color: block.description ? 'white' : 'black',
            cursor: 'pointer',
          }}
          title={block.description ? 'Has description' : 'Add description'}
        >
          Desc
        </button>

        <button
          onClick={handleAddChild}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            border: '1px solid #ccc',
            borderRadius: 4,
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
          title="Add child"
        >
          +
        </button>

        <button
          onClick={handleDelete}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            border: '1px solid #f44336',
            borderRadius: 4,
            backgroundColor: 'white',
            color: '#f44336',
            cursor: 'pointer',
          }}
          title="Delete block"
        >
          ×
        </button>
      </div>

      {showDescriptionInput && (
        <div style={{ marginTop: 4, marginLeft: 32 }}>
          <input
            value={block.description || ''}
            onChange={(e) =>
              updateDescription(block.id, e.target.value || undefined)
            }
            placeholder="Description..."
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '1px solid #ccc',
              borderRadius: 4,
              fontSize: 12,
              fontStyle: 'italic',
              backgroundColor: '#fafafa',
            }}
          />
        </div>
      )}

      {/* Recursive children */}
      {children.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {children.map((child) => (
            <BlockNode
              key={child.id}
              blockId={child.id}
              depth={depth + 1}
              focusManager={focusManager}
            />
          ))}
        </div>
      )}
    </div>
  );
}
