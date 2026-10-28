// Joins class lists, skipping falsy parts, and resolves NO conflicts: two classes that set the same CSS property
// are decided by stylesheet order, not by their position here. So a primitive never lets a caller's className
// fight one of its defaults; each default a caller may replace is a named prop (Panel, Button, Toast, Slot).
export function cn(...parts) { return parts.filter(Boolean).join(' '); }
