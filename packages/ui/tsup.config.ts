import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['lucide-react', '@clutter/shared', 'react', 'react-dom', '@emoji-mart/react', '@emoji-mart/data'],
  tsconfig: './tsconfig.json',
});

