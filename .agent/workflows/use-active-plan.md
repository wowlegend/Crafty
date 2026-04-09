---
description: how to use the ACTIVE_PLAN.md scratchpad for complex tasks
---

# Using the Active Plan

For any task requiring more than 2-3 steps or spanning multiple files, always use `memory/ACTIVE_PLAN.md` as your scratchpad.

## Steps

1. **Initialize the Plan:** Before writing code for a complex feature, overwrite `memory/ACTIVE_PLAN.md` with a clear, step-by-step checklist `[ ]` of the work to be done.
2. **Execute and Update:** As you complete each step, update the file to mark it as done `[x]`.
3. **Resuming Work:** If you start a new session and the user asks you to "continue," read `memory/ACTIVE_PLAN.md` first to see exactly where the previous session left off (the first `[ ]` unchecked box).
4. **Completion:** Once the entire feature is built, tested, and documented (via `/update-docs`), you can leave the completed checklist in `ACTIVE_PLAN.md` until the next task overwrites it.
