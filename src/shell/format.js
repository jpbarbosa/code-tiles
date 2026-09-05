// What the window's own pages agree on: the strip, the usage panel and the picker are three
// documents, and anything two of them draw the same way is said once, here.

// Green while there is room, ramping to red at the cap: the colour is the reading.
export function rampFor(utilization) {
  if (utilization >= 90) return '#f85149';
  if (utilization >= 75) return '#f0883e';
  if (utilization >= 50) return '#d29922';
  return '#3fb950';
}

export function resetLabel(resetsAt) {
  if (!resetsAt || !Number.isFinite(resetsAt)) return '';
  const date = new Date(resetsAt);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = date.toDateString() === new Date().toDateString();
  return `resets ${today ? time : `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`}`;
}

// A project's mark: the favicon its badge wears inside the window, or the initial on the
// project's own hue - which is sampled from that favicon when there is one, so the two never
// disagree on a colour. The strip and the picker both draw it, at their own sizes: the box is the
// page's business, the choice between an icon and a letter is not.
export function projectMark(project) {
  if (project.icon) {
    const image = document.createElement('img');
    image.src = project.icon;
    image.alt = '';
    // A .ico Chromium cannot decode would otherwise leave a broken-image glyph in the row.
    image.addEventListener('error', () => image.replaceWith(monogram(project)));
    return image;
  }
  return monogram(project);
}

function monogram(project) {
  const node = document.createElement('span');
  node.className = 'monogram';
  node.textContent = (project.name.trim()[0] || '?').toUpperCase();
  node.style.background = `oklch(0.62 0.15 ${project.hue})`;
  return node;
}
