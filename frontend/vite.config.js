import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The game-icon set is a lazy chunk so its ~75 KB of path data stays out of the boot chunk, but the title button's
// sword needs it by the end of the button's 0.9 s fade-in. A dynamic import is requested only once the boot chunk
// has downloaded and run; a modulepreload in index.html starts the fetch beside the boot chunk's own.
const GAME_ICONS_MODULE = '/src/ui/primitives/gameIcons.js';
function preloadGameIcons() {
    let base = '/';
    return {
        name: 'crafty:preload-game-icons',
        apply: 'build',
        configResolved(config) { base = config.base; },
        transformIndexHtml: {
            order: 'post',
            handler(html, ctx) {
                const chunk = Object.values(ctx.bundle ?? {}).find((c) => c.type === 'chunk' && c.facadeModuleId?.endsWith(GAME_ICONS_MODULE));
                if (!chunk) throw new Error(`crafty:preload-game-icons: no chunk is built from ${GAME_ICONS_MODULE}, so there is nothing to preload`);
                return [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${chunk.fileName}` }, injectTo: 'head' }];
            },
        },
    };
}

// `command` is 'serve' for `vite dev` / `vite preview`'s server, and 'build' for a production build.
// The config is a FUNCTION so `esbuild.drop` can depend on it — see the block below for why that matters.
export default defineConfig(({ command }) => ({
    plugins: [
        react({
            include: '**/*.{js,jsx}',
        }),
        preloadGameIcons(),
    ],
    esbuild: {
        // BUILD ONLY. Top-level `esbuild` options apply to the dev server's transform as well, so
        // `drop: ['console']` was stripping every console call out of the DEV bundle too — and the dev
        // server is what almost every instrument in this repo actually drives.
        //
        // MEASURED 2026-08-12 on a dev server at :4245, before the fix: `curl /src/ui/ErrorBoundary.jsx`
        // returned 11,888 bytes containing ZERO occurrences of `console.error`, and `/src/MenuSystem.jsx`
        // zero of `console.warn`. Not inferred from the docs — fetched from the running server.
        //
        // What was silently blind: every probe's `page.on('console')` crash filter (they run against
        // the DEV server), the console-error collectors in height-fog-instancing.spec.js and
        // perf-siege.spec.js, the ErrorBoundary's own `console.error` on a crash, and every `console.warn`
        // a fallback path emits. Each of those reports PASS by finding no errors, over a stream that had
        // been emptied at build time — this repo's signature defect, wired into the build config.
        //
        // Production still drops them: that is what `command === 'build'` covers.
        drop: command === 'build' ? ['console', 'debugger'] : [],
    },
    server: {
        port: 3000,
        open: true,
    },
    build: {
        outDir: 'build',
        sourcemap: false,
        // Vite 6's default target ('modules': es2020, edge88, firefox78, chrome87, safari14) with Chrome and Edge at 91.
        // esbuild 0.25 lowers every `?.` for Chrome and Edge below 91, whose only optional-chaining failure in the
        // compat-table is an optional call with a spread argument (`f?.(...args)`); the lowering cost the index chunk
        // 7,130 B, and no optional call in the build spreads its arguments (DECISIONS 2026-10-31 (lane L8, round 2)
        // item 350). Firefox and Safari already ran `?.` natively at these versions.
        target: ['es2020', 'edge91', 'firefox78', 'chrome91', 'safari14'],
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
}));
