import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        react({
            include: '**/*.{js,jsx}',
        }),
    ],
    server: {
        port: 3000,
        open: true,
    },
    build: {
        outDir: 'build',
        sourcemap: false,
        // Suppress chunk size warnings: 3D games (Three.js, Rapier) inherently produce large bundles.
        // For zero-stutter gameplay, we intentionally want these loaded upfront.
        chunkSizeWarningLimit: 4000,
    },
});
