// Joins class lists, skipping falsy parts, and resolves NO conflicts: two classes that set the same CSS property
// are decided by stylesheet order, not by their position here. So each default a caller may replace is a named
// prop (Panel, Button, Toast, Slot), and a className must not restate one; primitive-class-override-gates checks
// the named ones only, so a className that fights an unnamed default (a Button fill, a Toast background) still
// renders by stylesheet order.
export function cn(...parts) { return parts.filter(Boolean).join(' '); }
