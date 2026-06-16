import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        react({
            include: '**/*.{js,jsx}',
        }),
    ],
    esbuild: {
        drop: ['console', 'debugger'],
    },
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
        rollupOptions: {
            output: {
                // M6 #20: peel the big STABLE leaf libs out of the app entry chunk. These still load
                // upfront (no dynamic import -> no gameplay stutter, the zero-stutter intent above holds),
                // but an app-code deploy no longer busts the multi-MB vendor bytes, the browser fetches
                // them in parallel, and they stay warm in cache across deploys. react/react-dom are left
                // unbucketed on purpose (Rollup auto-shares them) to avoid react-split init-order issues.
                manualChunks(id) {
                    if (!id.includes('node_modules')) return;
                    if (id.includes('@dimforge')) return 'rapier';
                    if (id.includes('@react-three') || id.includes('/postprocessing')) return 'r3f';
                    if (id.includes('/three/') || id.includes('three-stdlib')) return 'three';
                },
            },
        },
    },
});
