import { Heart, Droplet, Drumstick, Sword, Shield, Gem, Settings, X, Sparkles, Flame, Snowflake, Zap } from 'lucide-react';

// Chrome/semantic icon primitive (M1: lucide-backed app-chrome set). M3 extends the
// `name` map to game-icons.net for game-semantic content + decouples emoji from data.
// All icons inherit `currentColor` (color via Tailwind text-* on the parent).
const MAP = {
  heart: Heart, mana: Droplet, hunger: Drumstick, sword: Sword, shield: Shield,
  gem: Gem, settings: Settings, close: X, sparkles: Sparkles,
  fire: Flame, ice: Snowflake, lightning: Zap,
};

export function Icon({ name, size = 20, strokeWidth = 2.5, ...props }) {
  const Cmp = MAP[name];
  if (!Cmp) return null;
  return <Cmp width={size} height={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
}
