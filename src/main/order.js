// What a rearrangement means, with nothing around it: no Electron, no store, no list to belong
// to. One project order stands behind the strip, the grid, ⌃⌘1…⌃⌘9 and the saved list, and the
// two drag gestures are the only things that rewrite it - each with the rule its own surface
// implies. They never contend: the strip is the only row in single view and the grid is the only
// thing on screen in the other, so whichever view you are in offers exactly one of them.

// The strip's rule: the dragged project lands at this index among the others and the rest shift
// along, the way a row of tabs behaves everywhere else. Past either end is the end, so a hand
// that runs off the row does not lose the project.
export function inserted(order, folder, index) {
  const rest = order.filter((entry) => entry !== folder);
  if (rest.length === order.length) return order;
  const at = Math.max(0, Math.min(rest.length, index));
  return [...rest.slice(0, at), folder, ...rest.slice(at)];
}

// The grid's rule: two tiles trade slots and nothing else moves. A grid has nothing to shift
// along, and an insert would shuffle every project between the two, leaving you hunting for the
// windows you were not touching.
export function swapped(order, a, b) {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0 || i === j) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Both rules speak for the OPEN projects, which are the only part of the order a gesture can see.
// So an order is applied to the open SLOTS, and an entry that is closed comes back out in the
// slot it already had - it was on nobody's screen to have moved.
//
// An order naming anything but each open project exactly once is dropped whole rather than
// applied in part: it is the snapshot of a gesture whose project closed under it, and a list
// missing one would leave that one with no slot at all.
export function arranged(entries, folders) {
  const open = entries.filter((entry) => entry.open);
  const queue = folders.map((folder) => open.find((entry) => entry.folder === folder)).filter(Boolean);
  if (queue.length !== open.length || new Set(folders).size !== folders.length) return entries;
  return entries.map((entry) => (entry.open ? queue.shift() : entry));
}
