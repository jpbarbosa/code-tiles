// A project's colour is a fact about its path, not a stored preference: the same folder is the
// same hue on every machine and after every reset, and there is no field to migrate when this
// rule changes. Two projects can collide; the path under the name is what tells them apart.
export function hueFor(folder) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < folder.length; i += 1) {
    hash ^= folder.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}
