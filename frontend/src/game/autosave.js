/** Debounced autosave scheduler (pure; injectable save fn). schedule() debounces;
 * flush() saves immediately if pending; cancel() drops a pending save. */
export function createAutosave({ save, delayMs = 5000 }) {
  let timer = null;
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  return {
    schedule() { clear(); timer = setTimeout(() => { timer = null; save(); }, delayMs); },
    flush() { if (timer !== null) { clear(); save(); } },
    cancel() { clear(); },
  };
}
