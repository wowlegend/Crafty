# Crafty — Holistic Control-Scheme Design (2026-06-28)

> Prompted by Kevin's playtest finding: "F fires melee (wasn't it spell before?), spells are RMB-only, and how does this work on iPad?" — and the follow-up: **"if LMB casts spells, what happens to mining/building? give me the holistic SOTA recommendation for everything."**
>
> Status: DESIGN PROPOSAL — awaiting Kevin's pick before any build. Research-grounded (game-design convention sources, queried 2026-06-28). Touch build deferred (Kevin: audit/playtest first) but specced here for coherence.

## 1. The real problem: Crafty is three games sharing 2–3 mouse buttons

Crafty's input space has to express **eight** live verbs with one mouse + WASD:

| Domain | Verbs |
|---|---|
| Voxel builder | **mine**, **place**, interact/open |
| Action melee | **melee swing** |
| Spellcaster RPG | **cast** (of a selected spell) |
| Aspect identity | **roar / grab / snare / imbue** (R/V/X/Z) |
| Locomotion | move, jump, dodge |

A mouse has ~3 buttons. So *something* must be shared. The design question is **how** you share — and that is the entire debate. Three industry patterns exist (all confirmed in the research):

- **Dedicated buttons** — one verb per input. Cleanest, but you run out of buttons fast (game-wisdom: "number of inputs is the biggest complexity factor").
- **Contextual routing** — one button, target-aware (e.g. click a mob → attack; click a block → mine). Recognized SOTA (Insomniac's "a button owns a *category* of behavior"; the universal "contextual interact" key). **This is exactly what Crafty's #72 verb router already does.** Risk (game-wisdom, verbatim): "if too many commands are on one button, it's easy to have the *wrong one* go off."
- **Modal** — a stance toggle (Build mode vs Combat mode) swaps the whole button map. Focused + uncluttered, but mode-confusion is "a risk not to be taken lightly" (Overland devs).

## 2. Direct answer: do NOT move spell-cast onto LMB

LMB-cast is the intuitive-sounding ask, but it's the wrong move, for two hard reasons:

1. **It evicts mining from its universal home.** In *every* voxel game (Minecraft, Vintage Story, Terasology…) **LMB = mine/attack, RMB = place/use** — the single deepest mental model your players arrive with. Putting cast on LMB forces mine onto a worse input and breaks that expectation. (gamedev.se: "we're used to LMB = attack, RMB = inspect/target — the more you put on one button, the greater the learning curve.")
2. **It collides with melee.** Melee is *also* a left-hand/primary verb. LMB can be mine **or** melee (contextually) — adding cast as a third LMB meaning is the over-loaded-button anti-pattern.

So: **keep LMB = mine/melee (Minecraft-consistent); keep cast on RMB / a held input.** The thing players are actually frustrated by isn't *which* button casts — it's that the scheme is **unpredictable and undiscoverable**. Fix that, not the binding.

## 3. The current scheme (verb router #72) — what's right and what's wrong

| Input | Current behavior |
|---|---|
| LMB (button 0) | held→hurl · mob-in-cone→**melee** · aimed-mob→**melee** · else terrain→**mine** · else swing |
| RMB (button 2) | held→slam · chest→**interact** · aimed-mob→**cast** · else terrain→**place** · else cast |
| F | **melee** (dedicated; W1 removed the old held-F cast) |
| 1–4 / hotbar | select active spell |
| R / V / X / Z | roar / grab / snare / imbue |

**Right:** the contextual core is a legitimate SOTA pattern and keeps the no-mode-switch flow. **Wrong (the actual complaints):**
- **Unpredictable:** a wandering mob into your cone turns an intended *mine* into an *attack*; no target turns an intended *cast* into a *placed block*. (The documented mis-fire risk.)
- **Undiscoverable:** spell-on-RMB is non-obvious, F duplicates LMB-melee, and the on-screen controls sheet auto-fades after ~8s. New players can't form the mental model.
- **No telegraph:** the crosshair doesn't tell you which verb a click will fire.
- **Touch:** the 4 Aspect verbs are unreachable (no buttons) — the entire Aspect identity is desktop-only.

## 4. Recommended scheme — "contextual core + telegraph + force-modifier + discoverability"

Keep the fluid contextual router; surgically kill the three failure modes. (Option A below — recommended.)

**Desktop (KB+mouse):**
- **Move** WASD · **Jump** Space · **Dodge** Shift (or double-tap) · **Sprint** hold.
- **LMB = primary:** mob in reach → **melee**; else → **mine** the targeted block. (Minecraft-consistent.)
- **RMB = secondary:** valid spell target/aim → **cast** selected spell; else → **place** block; chest → **open**.
- **★ Verb-telegraphing reticle (the key fix):** the crosshair shows a tiny icon for what the *current* click will do (sword / pickaxe / spark / block / hand). Removes the "wrong verb fired" surprise — the player always knows before clicking. (Insomniac-style: reveal the category, don't hide it.)
- **★ Force-modifier:** hold **Alt** = force build verbs (mine/place ignore combat routing) so you can *always* mine/build even with mobs around — kills the "I wanted to mine but attacked" case.
- **F = "force melee"** (swing regardless of target/terrain) — now non-redundant: LMB mines when there's no mob; F always swings. (Or rebind to taste.)
- **1–4 = select active spell** (spell→slot→hotkey, the SOTA spell-slot convention; never bind spells directly to keys). RMB casts the selected one. Optional: a hold-to-open **radial spell wheel** on a key for >4 spells.
- **R / V / X / Z = Aspect verbs** (keep).
- **★ Persistent, toggleable control legend + a one-time first-session interactive tutorial** (the discoverability fix every source stresses).
- **★ Full key-rebinding menu** (the baseline PC expectation; ergonomics sources treat it as non-negotiable).

**Touch (iPad/iPhone) — DEFERRED to a coherent pass, specced for completeness:**
- Left thumb = floating **move** joystick; right thumb-drag = **look**; center crosshair.
- **Action** button = LMB-equivalent (mine/melee, contextual + auto-target snap, since touch can't aim precisely).
- **Cast** button = RMB-equivalent (cast/place).
- **★ Radial Aspect-verb wheel** (press-and-hold → ring of the *unlocked* R/V/X/Z verbs) — closes the parity gap. (This is the spec's unbuilt M3.)
- Jump / Dodge / Panels buttons (exist today).
- **Auto-target assist** on by default (touch precision is low; snap-to-nearest is the mobile-ARPG norm).

## 5. Options & recommendation

| Option | What | Pros | Cons | Risk |
|---|---|---|---|---|
| **A — Contextual core + telegraph + force-mod + discoverability** (RECOMMENDED) | Keep #72 router; add reticle telegraph, Alt-force-build, persistent legend, rebinding | Preserves the fluid no-mode feel; keeps Minecraft mental model; fixes the *actual* complaints; least re-architecture | Contextual routing still exists (telegraph + force-mod mitigate, don't delete it) | Low |
| **B — Modal stance toggle** | A "Build mode / Combat mode" switch swaps LMB/RMB meaning per mode | Zero mis-fire; each mode dead-simple | Mode-confusion; a toggle interrupts flow; bigger rebuild | Med |
| **C — LMB=cast** (Kevin's hypothetical) | Spell on LMB | Matches twitch-shooter muscle memory | **Breaks the voxel LMB=mine model; evicts mine + collides with melee** | High |

**Recommendation: Option A.** It directly answers "what happens to mine/build if LMB casts?" — *don't* do that; instead keep mining where every player expects it and fix the predictability + discoverability that are the real pain. The verb-telegraphing reticle + Alt-force-build is the highest-leverage, lowest-risk change; the persistent legend + rebinding are table stakes. Option B is the fallback if a playtest shows the telegraphed contextual router still mis-fires too often. Option C is not recommended.

## 6. Before building (decision gate)
- **Kevin picks A / B / C** (or a hybrid).
- This is a FEEL change — it must be **playtested**, and the verb-telegraph reticle + force-modifier should ship behind the existing gates + a LIVE-LOOK.
- Sequencing: this folds into the holistic input/UX pass + the #44 full playtest already on the gap list; touch verb access (the radial wheel) is the deferred M3 build.
- **Meta:** the F-button confusion is one instance of a broader truth (Kevin: "lots of bugs like this across all aspects") — the new gameplay-flow E2E + a control-scheme playtest are how these get caught systematically instead of one-at-a-time.
