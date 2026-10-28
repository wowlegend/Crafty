import { useSyncExternalStore } from 'react';
import {
  Settings, X, ChevronRight, Compass,
  Gift, Lock, Check, AlertTriangle, Skull, Sun, Moon, CloudRain,
  Snowflake, Home, Globe, Backpack, Footprints, Sparkles, PartyPopper,
  ArrowRight, ArrowUp, ArrowDown, Building2, Dumbbell, Landmark, Hammer, Heart,
} from 'lucide-react';

// Icon primitive (S1C-M1): flat-2-tone GAME-SEMANTIC icons + lucide app-chrome.
// Game-semantic content uses the baked game-icons.net set (gameIcons.js):
// a single `currentColor` fill IS the flat-2-tone look (tile fill = tone 1, icon = tone 2).
// App-chrome (settings/close/chevron/compass) stays on lucide-react outline icons.
// All icons inherit `currentColor` (color via Tailwind text-* on the parent).

// The baked set is ~75 KB of path data, so it is its own chunk, fetched as soon as this module evaluates rather
// than parsed on the way to the title. Until it lands a game icon is an empty svg of the same box, so nothing
// around it moves when the paths arrive. Every baked icon shares this viewBox.
const GAME_VIEWBOX = '0 0 512 512';
let gameIcons = null;
let pendingGameIcons = null;
let gameIconFailureLogged = false;
const gameIconListeners = new Set();

// A rejected load is forgotten, so the next Icon to mount asks again (offline, a CDN hiccup, a deploy that 404s the
// old hash) instead of every game icon staying a placeholder for the rest of the session. A failure is logged once:
// a flaky network would otherwise print one error per retry.
function requestGameIcons() {
  if (gameIcons || pendingGameIcons) return;
  pendingGameIcons = import('./gameIcons.js').then(
    (m) => { gameIcons = m.GAME_ICONS; for (const notify of gameIconListeners) notify(); },
    (err) => {
      pendingGameIcons = null;
      if (gameIconFailureLogged) return;
      gameIconFailureLogged = true;
      console.error('Icon: the game-icon chunk failed to load; game icons stay placeholders until a later icon retries it', err);
    },
  );
}
requestGameIcons();

// Subscribing is the mount, so it is where a failed load gets its retry.
const subscribeGameIcons = (notify) => {
  gameIconListeners.add(notify);
  requestGameIcons();
  return () => gameIconListeners.delete(notify);
};
const readGameIcons = () => gameIcons;

// Lucide chrome icons (outline, stroke-driven — not game content).
const CHROME = {
  settings: Settings,
  close: X,
  chevron: ChevronRight,
  compass: Compass,
  gift: Gift,
  lock: Lock,
  check: Check,
  warning: AlertTriangle,
  skull: Skull,
  sun: Sun,
  moon: Moon,
  rain: CloudRain,
  snow: Snowflake,
  home: Home,
  globe: Globe,
  backpack: Backpack,
  footprints: Footprints,
  sparkles: Sparkles,
  party: PartyPopper,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  building: Building2,
  strength: Dumbbell,
  landmark: Landmark,
  hammer: Hammer,
  heart: Heart,
};

// Friendly name -> baked game-icon key (keys exactly as in gameIcons.js).
const GAME_NAMES = {
  sword: 'broadsword',
  weapon: 'broadsword',
  dagger: 'bowie-knife',
  mace: 'wooden-club',
  club: 'wooden-club',
  bow: 'bow-arrow',
  pickaxe: 'mining',
  necklace: 'gem-pendant',
  pendant: 'gem-pendant',
  gem: 'gem-pendant',
  potion: 'round-potion',
  apple: 'apple',
  meat: 'meat',
  food: 'meat',
  scroll: 'scroll-unfurled',
  rune: 'rune-stone',
  magic: 'magic-swirl',
  arcane: 'magic-swirl',
  coins: 'two-coins',
  gold: 'two-coins',
  star: 'star-formation',
  upgrade: 'upgrade',
  up: 'upgrade',
  impact: 'gooey-impact',
  helmet: 'crested-helmet',
  chest: 'chest-armor',
  chestplate: 'chest-armor',
  vest: 'armor-vest',
  legs: 'leg-armor',
  boots: 'leather-boot',
  shield: 'checked-shield',
  force: 'mighty-force',
  crit: 'mighty-force',
  run: 'run',
  spd: 'run',
  woundatk: 'sword-wound',
  fire: 'fire',
  ice: 'snowflake-2',
  snow: 'snowflake-2',
  lightning: 'lightning-arc',
  health: 'health-normal',
  water: 'water-drop',
  mana: 'water-drop',
  // M3 additions (filled game-content glyphs).
  crown: 'crown',
  dragon: 'dragon-head',
  spider: 'spider-face',
  eye: 'eyeball',
  pig: 'pig',
  cow: 'cow',
  emerald: 'emerald',
  diamond: 'cut-diamond',
  hide: 'animal-hide',
  leather: 'animal-hide',
  string: 'wool',
  wool: 'wool',
  ore: 'ore',
  nugget: 'ore',
  zombie: 'shambling-zombie',
  trophy: 'trophy-cup',
  'chest-closed': 'locked-chest',
  treasure: 'locked-chest',
  'chest-open': 'open-treasure-chest',
  wizard: 'pointy-hat',
  mascot: 'pointy-hat',
  arrow: 'arrow-cluster',
  bone: 'crossed-bones',
  pearl: 'glowing-artifact',
  artifact: 'glowing-artifact',
};

export function Icon({ name, size = 20, strokeWidth = 2.5, className, ...props }) {
  const icons = useSyncExternalStore(subscribeGameIcons, readGameIcons, readGameIcons);
  const Chrome = CHROME[name];
  if (Chrome) {
    return (
      <Chrome
        width={size}
        height={size}
        strokeWidth={strokeWidth}
        className={className}
        aria-hidden
        {...props}
      />
    );
  }

  const key = GAME_NAMES[name];
  if (!key) return null;
  const gi = icons?.[key];
  if (icons && !gi) return null;
  if (!gi) {
    return (
      <svg viewBox={GAME_VIEWBOX} width={size} height={size} className={className} style={{ fill: 'currentColor' }} aria-hidden {...props} />
    );
  }
  return (
    <svg
      viewBox={gi.vb}
      width={size}
      height={size}
      className={className}
      style={{ fill: 'currentColor' }}
      aria-hidden
      {...props}
    >
      <g dangerouslySetInnerHTML={{ __html: gi.inner }} />
    </svg>
  );
}
