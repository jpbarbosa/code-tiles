// The two things both the strip's bars and the panel's rows have to agree on.

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
