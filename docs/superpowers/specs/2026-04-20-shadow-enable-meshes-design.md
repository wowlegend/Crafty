# Design: Enabling Shadows for Physical World Meshes

## Goal
To ensure ALL physical world meshes are shadow-enabled (casting and receiving shadows) to improve visual fidelity.

## Files to be Modified
1. `src/SimplifiedNPCSystem.jsx`
2. `src/Components.jsx`
3. `src/AdvancedGameFeatures.jsx`

## Components and Meshes to be Updated

### NPCs (`src/SimplifiedNPCSystem.jsx`)
- Body mesh: Add `castShadow receiveShadow`.
- Head mesh: Ensure `castShadow receiveShadow` are correctly applied.
- All 4 legs (or more if spider): Add `castShadow receiveShadow`.

### Player (`src/Components.jsx`)
- Hands (both upper and lower mesh parts): Add `castShadow receiveShadow`.
- Arms: Ensure any meshes representing arms have shadow props.
- Held Block preview: Add `castShadow receiveShadow`.

### Boss and Pets (`src/AdvancedGameFeatures.jsx`)
- `BossEntity` body parts: Add `castShadow receiveShadow`.
- `PetEntities` body and head parts: Add `castShadow receiveShadow`.

## Approach
Surgically add `castShadow` and `receiveShadow` to the identified meshes. This is a non-breaking change that only affects rendering and is idiomatic in React Three Fiber.

## Success Criteria
- Build command passes successfully.
- All identified meshes have `castShadow receiveShadow` props in the code.

## Testing Strategy
- Run the build command to ensure no syntax errors.
- Visual inspection would be the final test, but since this is an automated process, the build success and manual confirmation in code will suffice.
