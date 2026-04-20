# Shadow Enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure all physical world meshes in NPCs, Player, and Advanced Features are shadow-enabled (castShadow, receiveShadow).

**Architecture:** Surgically add `castShadow` and `receiveShadow` to the identified meshes in the React Three Fiber components.

**Tech Stack:** React, Three.js, React Three Fiber.

---

### Task 1: Update SimplifiedNPCSystem.jsx

**Files:**
- Modify: `src/SimplifiedNPCSystem.jsx`

- [ ] **Step 1: Add castShadow receiveShadow to Body mesh**
- [ ] **Step 2: Add castShadow receiveShadow to all 4 legs**
- [ ] **Step 3: Add castShadow receiveShadow to Spider legs**

```jsx
// Body
<mesh castShadow receiveShadow position={[0, bodyH / 2, 0]}>
  <boxGeometry args={[bodyW, bodyH, bodyD]} />
  <meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} />
</mesh>

// Legs
<mesh castShadow receiveShadow ref={(el) => legRefs.current[0] = el} position={[-bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} /></mesh>
<mesh castShadow receiveShadow ref={(el) => legRefs.current[1] = el} position={[bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} /></mesh>
<mesh castShadow receiveShadow ref={(el) => legRefs.current[2] = el} position={[-bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} /></mesh>

// Spider legs
<mesh castShadow receiveShadow ref={(el) => legRefs.current[i] = el} key={i} position={[
  Math.cos((i / 8) * Math.PI * 2) * 0.8, 0, Math.sin((i / 8) * Math.PI * 2) * 0.8
]} rotation={[0, 0, Math.PI / 4]}>
  <boxGeometry args={[0.1, 0.8, 0.1]} />
  <meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} />
</mesh>
```

---

### Task 2: Update Components.jsx

**Files:**
- Modify: `src/Components.jsx`

- [ ] **Step 1: Add castShadow receiveShadow to Right hand lower part**
- [ ] **Step 2: Add castShadow receiveShadow to Left hand lower part**
- [ ] **Step 3: Add castShadow receiveShadow to Held Block preview**

```jsx
// Right hand lower part
<mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>

// Left hand lower part
<mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>

// Held Block preview
<mesh castShadow receiveShadow>
  <boxGeometry args={[1, 1, 1]} />
  <meshStandardMaterial roughness={0.8} metalness={0.1} color={BLOCK_TYPES[selectedBlock]?.color || '#567C35'} />
</mesh>
```

---

### Task 3: Update AdvancedGameFeatures.jsx

**Files:**
- Modify: `src/AdvancedGameFeatures.jsx`

- [ ] **Step 1: Add castShadow receiveShadow to all BossEntity parts**
- [ ] **Step 2: Add castShadow receiveShadow to all PetEntities parts**

```jsx
// BossEntity parts
<mesh castShadow receiveShadow>
    <boxGeometry args={[3, 2, 4]} />
    <meshStandardMaterial color={phase.color} emissive={phase.color} emissiveIntensity={0.3} />
</mesh>
<mesh castShadow receiveShadow position={[0, 1.5, 1.5]}>
    <boxGeometry args={[1.5, 1.5, 2]} />
    <meshStandardMaterial color={phase.color} emissive={BOSS_CONFIG.secondaryColor} emissiveIntensity={0.4} />
</mesh>
<mesh castShadow receiveShadow position={[-2.5, 1, 0]} rotation={[0, 0, 0.3]}>
    <boxGeometry args={[2, 0.2, 3]} />
    <meshStandardMaterial color={BOSS_CONFIG.secondaryColor} emissive={BOSS_CONFIG.secondaryColor} emissiveIntensity={0.2} transparent opacity={0.8} />
</mesh>
<mesh castShadow receiveShadow position={[2.5, 1, 0]} rotation={[0, 0, -0.3]}>
    <boxGeometry args={[2, 0.2, 3]} />
    <meshStandardMaterial color={BOSS_CONFIG.secondaryColor} emissive={BOSS_CONFIG.secondaryColor} emissiveIntensity={0.2} transparent opacity={0.8} />
</mesh>
<mesh castShadow receiveShadow position={[-0.4, 1.8, 2.5]}>
    <sphereGeometry args={[0.2, 8, 8]} />
    <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
</mesh>
<mesh castShadow receiveShadow position={[0.4, 1.8, 2.5]}>
    <sphereGeometry args={[0.2, 8, 8]} />
    <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={1} />
</mesh>

// PetEntities parts
<mesh castShadow receiveShadow>
    <boxGeometry args={isPig ? [0.8, 0.6, 1.0] : [1.0, 0.8, 1.2]} />
    <meshStandardMaterial
        color={isPig ? '#ffb6c1' : '#8B5A2B'}
        emissive={isPig ? '#ff69b4' : '#DEB887'}
        emissiveIntensity={0.15}
    />
</mesh>
<mesh castShadow receiveShadow position={[0, 0.4, isPig ? 0.5 : 0.6]}>
    <boxGeometry args={isPig ? [0.5, 0.5, 0.5] : [0.6, 0.6, 0.4]} />
    <meshStandardMaterial
        color={isPig ? '#ffb6c1' : '#8B5A2B'}
        emissive={isPig ? '#ff69b4' : '#DEB887'}
        emissiveIntensity={0.15}
    />
</mesh>
<mesh castShadow receiveShadow position={[0, 1.2, 0]}>
    <sphereGeometry args={[0.15, 8, 8]} />
    <meshStandardMaterial color="#ff69b4" emissive="#ff69b4" emissiveIntensity={0.8} />
</mesh>
```

---

### Task 4: Final Verification

- [ ] **Step 1: Run build command to verify no syntax errors**
- [ ] **Step 2: Commit all changes**

Run: `npm run build`
Expected: Build SUCCESS
