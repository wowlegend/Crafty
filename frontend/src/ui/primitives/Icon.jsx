import {
  Settings, X, ChevronRight, Compass,
  Trophy, Gift, Lock, Check, AlertTriangle, Skull, Sun, Moon, CloudRain,
  Snowflake, Home, Globe, Backpack, Footprints, Sparkles, PartyPopper,
  ArrowRight, Building2, Dumbbell, Gem, Landmark, Hammer, Heart, Bug,
} from 'lucide-react';
import { GAME_ICONS } from './gameIcons.js';

// Icon primitive (S1C-M1): flat-2-tone GAME-SEMANTIC icons + lucide app-chrome.
// Game-semantic content uses the locked comp's baked game-icons.net set (gameIcons.js):
// a single `currentColor` fill IS the flat-2-tone look (tile fill = tone 1, icon = tone 2).
// App-chrome (settings/close/chevron/compass) stays on lucide-react outline icons.
// All icons inherit `currentColor` (color via Tailwind text-* on the parent).

// Lucide chrome icons (outline, stroke-driven — not game content).
const CHROME = {
  settings: Settings,
  close: X,
  chevron: ChevronRight,
  compass: Compass,
  trophy: Trophy,
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
  building: Building2,
  strength: Dumbbell,
  'gem-chip': Gem,
  landmark: Landmark,
  hammer: Hammer,
  heart: Heart,
  bug: Bug,
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

  const gi = GAME_ICONS[GAME_NAMES[name]];
  if (!gi) return null;
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
