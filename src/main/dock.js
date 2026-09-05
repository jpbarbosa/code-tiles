// The dock badge: how many projects are waiting on YOU.
//
// Pure and electron-free, so it can be tested without a display - the one call that touches the
// dock lives in src/main/desk.js, which is where every other "the app now looks like this"
// decision is already made.

// The two states that are about you rather than about Claude: a question nobody has answered,
// and a turn that ended you have not looked at. `working` is Claude busy and asks nothing;
// `active` is a session sitting there; `idle` is no session at all.
const WAITING = new Set(['attention', 'finished']);

// Open projects only. A closed project has no tile to go and look at, so counting it would be a
// badge you cannot answer.
export function waiting(projects) {
  return projects.filter((project) => project.open && WAITING.has(project.claudeState)).length;
}

// The dock is the one surface that reaches you with the app behind something else, which makes
// this the only part of the Claude signal that works when you are not looking at it.
//
// Empty rather than "0": a badge is a thing that arrived, and a zero in one is the app telling
// you that nothing did. macOS clears the badge on an empty string.
export function badgeFor(projects) {
  const count = waiting(projects);
  return count ? String(count) : '';
}
