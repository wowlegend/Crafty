// dragonLoader.js — the Shadow Dragon's code is its own chunk, downloaded when a fight is due (DECISIONS 2026-10-30
// item 121). world/bossSystem.js preloads it once the player qualifies for a fight, or at mount when a reload restored
// one, so the chunk is normally in long before the arrival; GameScene mounts <LazyDragon> only while the fight is on.
import { lazy, createElement, Component, Suspense, useRef } from 'react';
import { onceRetrying } from '../ui/panels/lazyPanels.js';
import { useGameStore } from '../store/useGameStore';

/** `importer` run at most once while pending or loaded, and again after a rejection (offline, a CDN hiccup). */
export function makeDragonLoader(importer) {
  let mod = null;
  const load = onceRetrying(() => importer().then((m) => { mod = m; return m; }));
  return {
    load,
    // A failed preload is silent: the mount's own load retries and its boundary tells the player.
    preload: () => { load().catch(() => {}); },
    loaded: () => mod,
  };
}

const dragonLoader = makeDragonLoader(() => import('./BossEntity.jsx'));

/** Start downloading the dragon without waiting. */
export const preloadDragon = () => dragonLoader.preload();

/** A fight the save restored is on from the first frame, so its chunk is wanted at mount, not at an arrival. */
export const shouldPreloadAtMount = (state) => state?.bossActive === true;

/** A failed chunk is tried again this long after the failure, this many times, before the encounter is suspended. */
export const DRAGON_RETRY_MS = 5000;
export const DRAGON_RETRIES = 3;

/**
 * The dragon's failure stays the dragon's: it renders nothing, tells the player, and remounts the dragon after
 * DRAGON_RETRY_MS, DRAGON_RETRIES times. After the last retry fails it calls `onGiveUp` (the encounter is suspended
 * with its HP kept) and says why, naming a reload, which is the only cure for a tab left open across a deploy (its old
 * hashed chunk 404s on every retry). `children` is a function of the attempt, so each remount builds a fresh lazy: a
 * rejected React.lazy rethrows its error on every render.
 */
class DragonBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, attempt: 0 };
    this.timer = null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    const { notify, onGiveUp } = this.props;
    if (this.state.attempt >= DRAGON_RETRIES) {
      notify?.('notice.dragonLoadGaveUp');
      onGiveUp?.();
      return;
    }
    notify?.('notice.dragonLoadFailed');
    this.timer = setTimeout(() => {
      this.timer = null;
      this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
    }, DRAGON_RETRY_MS);
  }
  componentWillUnmount() { if (this.timer) clearTimeout(this.timer); }
  render() { return this.state.failed ? null : this.props.children(this.state.attempt); }
}

/**
 * The dragon component over `loader`. Once the chunk is in, it renders the module's BossEntity directly: React.lazy
 * suspends on its first render even when its promise has resolved (lazyPanels.js), which would cost a blank beat on
 * every fight after the first. Before that, the lazy sits in its OWN <Suspense>: GameScene's boundary also wraps
 * <Physics>, the world, the Player and the post passes, and a lazy that suspends in an already-revealed boundary on a
 * non-transition update hides every sibling and runs their layout-effect cleanups, where R3F's useFrame unsubscribes.
 * `bare` drops that inner boundary; it exists for the test that shows what the boundary prevents.
 */
export function makeLazyDragon(loader, { notify, onGiveUp, bare = false } = {}) {
  const Dragon = (props) => {
    const direct = useRef(loader.loaded() !== null);
    const lazies = useRef([]);
    if (direct.current) return createElement(loader.loaded().BossEntity, props);
    return createElement(DragonBoundary, { notify, onGiveUp }, (attempt) => {
      if (!lazies.current[attempt]) {
        lazies.current[attempt] = lazy(() => loader.load().then((m) => ({ default: m.BossEntity })));
      }
      const el = createElement(lazies.current[attempt], props);
      return bare ? el : createElement(Suspense, { fallback: null }, el);
    });
  };
  Dragon.displayName = 'LazyDragon';
  return Dragon;
}

/** The game's dragon: notices through the one channel, and a give-up that suspends the encounter (bossSystem). */
export const LazyDragon = makeLazyDragon(dragonLoader, {
  notify: (key) => useGameStore.getState().addNotification?.(key, 'warning'),
  onGiveUp: () => useGameStore.getState().suspendBossEncounter?.(),
});
