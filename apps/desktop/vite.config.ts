import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 🔥 DEV MODE: Use source files directly, not dist
      // This enables hot reload and immediate feedback during development
      // No package rebuilds needed - changes apply instantly
      '@clutter/editor': path.resolve(
        __dirname,
        '../../packages/editor/index.ts'
      ),
      '@clutter/state': path.resolve(
        __dirname,
        '../../packages/state/src/index.ts'
      ),
      '@clutter/shared': path.resolve(
        __dirname,
        '../../packages/shared/src/index.ts'
      ),
      '@clutter/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@clutter/domain': path.resolve(
        __dirname,
        '../../packages/domain/src/index.ts'
      ),
    },
  },
  // Reduce console noise
  clearScreen: false,
  logLevel: 'info',
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
