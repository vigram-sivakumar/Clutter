import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    '@clutter/ui',
    'react',
    'react-dom',
    '@tiptap/react',
    '@tiptap/core',
    '@tiptap/pm',
  ],
  tsconfig: './tsconfig.json',
});
