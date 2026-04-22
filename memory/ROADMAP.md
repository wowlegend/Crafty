# Roadmap & Future Enhancements

*(Updated via Session Archivist - April 19, 2026)*

### Phase 13: Progression & Progression Loop
*Structuring the underlying progression systems and expanding world interactions.*
- [ ] **Player Leveling System**: Connect XP orbs to player progression with UI feedback.
- [ ] **Expanded NPC Interactions**: Reintroduce trading systems, quest hubs, and allied mobs.
- [ ] **Persistent World Saving**: Build out backend support for chunk compression and saving player states directly to the database.

### Technical Debt (For Next Audit)
- [ ] Evaluate ECS Web Worker bridge performance with 100+ entities to ensure serialized array transfers don't bottleneck the main thread.
- [ ] Move any remaining UI state logic out of `GameScene.jsx` into smaller focused layout components.
