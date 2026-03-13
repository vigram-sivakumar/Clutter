#!/bin/bash

OUT="editor-review.ts"

(
echo "===== editor-controller.ts ====="
cat src/editor/editor-controller.ts

echo -e "\n\n===== Editor.tsx ====="
cat src/editor/Editor.tsx

echo -e "\n\n===== keymap.ts ====="
cat src/editor/keymap.ts

echo -e "\n\n===== renderer.ts ====="
cat src/editor/renderer.ts

echo -e "\n\n===== selection.ts ====="
cat src/editor/selection.ts

echo -e "\n\n===== commands.ts ====="
cat src/engine/commands.ts

echo -e "\n\n===== engine.ts ====="
cat src/engine/engine.ts

echo -e "\n\n===== history.ts ====="
cat src/engine/history.ts
) > "$OUT"

echo "Editor snapshot written to $OUT"
