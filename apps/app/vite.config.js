import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'node:path';
export default defineConfig({
    plugins: [react(), svgr()],
    resolve: {
        alias: {
            '@app': path.resolve(__dirname, 'src/app'),
            '@components': path.resolve(__dirname, 'src/components'),
            '@core': path.resolve(__dirname, 'src/core'),
            '@features': path.resolve(__dirname, 'src/features'),
            '@design-system': path.resolve(__dirname, 'src/design-system'),
            '@styles': path.resolve(__dirname, 'src/design-system/styles'),
            '@shared': path.resolve(__dirname, 'src/shared'),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    },
    test: {
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
});
